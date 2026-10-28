import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ProductInterest } from '../generated/prisma/client.js';
import { normalizePhone, parseProduct, parseSumpSize } from './intake-parsing.js';
import { LeadAssignmentService } from './lead-assignment.service.js';
import { LeadIntakeService } from './lead-intake.service.js';

/**
 * Meta (Facebook) Lead Ads webhook, receiving end (#1).
 *
 *   GET  /webhooks/meta  - Meta's subscription check: echo hub.challenge when
 *                          hub.verify_token matches META_VERIFY_TOKEN.
 *   POST /webhooks/meta  - "leadgen" notifications. Meta only sends ids, so each
 *                          lead's answers are fetched from the Graph API with
 *                          META_PAGE_ACCESS_TOKEN, then created (source META)
 *                          unless it's a duplicate (same leadgen id or phone).
 *
 * Everything comes from environment variables; nothing is hardcoded. If they
 * are missing, the endpoints answer 503 "not configured" instead of crashing.
 */

interface FieldDatum {
  name: string;
  values: string[];
}

interface LeadgenChange {
  field?: string;
  value?: {
    leadgen_id?: string;
    form_id?: string;
    page_id?: string;
    ad_id?: string;
    created_time?: number;
    /** DEVELOPMENT ONLY: answers sent inline so the flow can be tested without Meta. */
    field_data?: FieldDatum[];
  };
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: { id?: string; time?: number; changes?: LeadgenChange[] }[];
}

export interface MetaProcessResult {
  leadgenId: string;
  status: 'created' | 'duplicate' | 'skipped' | 'error';
  detail: string;
}

const env = (name: string) => (process.env[name] ?? '').trim();

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name);

  constructor(
    private readonly intake: LeadIntakeService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  /** What's configured, for the README / admin screen (never returns the values). */
  status() {
    return {
      verifyTokenSet: Boolean(env('META_VERIFY_TOKEN')),
      appSecretSet: Boolean(env('META_APP_SECRET')),
      pageAccessTokenSet: Boolean(env('META_PAGE_ACCESS_TOKEN')),
      graphApiVersion: env('META_GRAPH_API_VERSION') || 'v23.0',
    };
  }

  /** Subscription handshake. Returns the challenge to echo back. */
  verify(mode?: string, token?: string, challenge?: string): string {
    const expected = env('META_VERIFY_TOKEN');
    if (!expected) {
      this.logger.warn('Meta verify request received but META_VERIFY_TOKEN is not set');
      throw new ServiceUnavailableException('Meta webhook is not configured (META_VERIFY_TOKEN is not set)');
    }
    if (mode !== 'subscribe' || !token || !safeEqual(token, expected) || !challenge) {
      throw new ForbiddenException('Verification failed');
    }
    return challenge;
  }

  /** Checks X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, META_APP_SECRET). */
  checkSignature(rawBody: Buffer | undefined, header: string | undefined) {
    const secret = env('META_APP_SECRET');
    if (!secret) {
      this.logger.warn('Meta lead webhook received but META_APP_SECRET is not set; ignoring it');
      throw new ServiceUnavailableException('Meta webhook is not configured (META_APP_SECRET is not set)');
    }
    if (!rawBody || !header?.startsWith('sha256=')) throw new ForbiddenException('Missing or malformed signature');
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!safeEqual(header, expected)) throw new ForbiddenException('Signature does not match');
  }

  async handle(payload: MetaWebhookPayload): Promise<MetaProcessResult[]> {
    const results: MetaProcessResult[] = [];
    if (payload.object !== 'page') return results;
    const ownerId = await this.intake.systemOwnerId();
    const rotation = await this.assignment.rotationIds();

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen' || !change.value?.leadgen_id) continue;
        const { leadgen_id: leadgenId, form_id: formId } = change.value;
        try {
          const fields = await this.leadFields(change.value);
          results.push(await this.createFromFields(leadgenId, formId, fields, ownerId, rotation));
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.error(`Meta lead ${leadgenId} could not be processed: ${detail}`);
          results.push({ leadgenId, status: 'error', detail });
        }
      }
    }
    return results;
  }

  /** The lead's answers: from the Graph API, or inline in development. */
  private async leadFields(value: NonNullable<LeadgenChange['value']>): Promise<FieldDatum[]> {
    if (value.field_data && process.env.NODE_ENV !== 'production') return value.field_data;

    const token = env('META_PAGE_ACCESS_TOKEN');
    if (!token) throw new Error('META_PAGE_ACCESS_TOKEN is not set, so the lead details cannot be fetched from Meta');
    const version = env('META_GRAPH_API_VERSION') || 'v23.0';
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(value.leadgen_id!)}`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', 'field_data,created_time,form_id');
    const secret = env('META_APP_SECRET');
    if (secret) url.searchParams.set('appsecret_proof', createHmac('sha256', secret).update(token).digest('hex'));

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => ({}))) as { field_data?: FieldDatum[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Graph API ${res.status}: ${body.error?.message ?? 'request failed'}`);
    return body.field_data ?? [];
  }

  private async createFromFields(
    leadgenId: string,
    formId: string | undefined,
    fields: FieldDatum[],
    ownerId: string,
    rotation: string[],
  ): Promise<MetaProcessResult> {
    const answer = (...names: string[]) => {
      for (const n of names) {
        const f = fields.find((x) => x.name.toLowerCase() === n);
        if (f?.values?.[0]?.trim()) return f.values[0].trim();
      }
      return '';
    };
    const name =
      answer('full_name', 'name') || [answer('first_name'), answer('last_name')].filter(Boolean).join(' ').trim();
    const phone = normalizePhone(answer('phone_number', 'phone', 'mobile'));
    if (!phone) return { leadgenId, status: 'skipped', detail: 'No valid phone number in the lead form answers' };

    // Optional custom questions on the form; otherwise the telecaller finds out.
    // A sump size answer on its own means a sump.
    const sizeAnswer = parseSumpSize(answer('sump_size', 'sump_size_litres', 'size', 'capacity'));
    const product: ProductInterest | null = parseProduct(answer('product', 'product_interest')) ?? (sizeAnswer ? 'SUMP' : null);
    const size = product === 'SUMP' ? sizeAnswer : undefined;

    const known = new Set([
      'full_name', 'name', 'first_name', 'last_name', 'phone_number', 'phone', 'mobile', 'city', 'email',
      'product', 'product_interest', 'sump_size', 'sump_size_litres', 'size', 'capacity',
    ]);
    const extra = fields
      .filter((f) => !known.has(f.name.toLowerCase()) && f.values?.length)
      .map((f) => `${f.name.replace(/_/g, ' ')}: ${f.values.join(', ')}`);

    const result = await this.intake.create({
      name: name.length >= 2 ? name.slice(0, 120) : `Meta lead ${leadgenId}`,
      phone,
      email: answer('email') || null,
      city: answer('city') || null,
      source: 'META',
      productInterest: product,
      sumpSizeLitres: size ?? null,
      rotation,
      notes: extra.length ? `Meta lead form answers: ${extra.join('; ')}` : null,
      assignedToId: null,
      createdById: ownerId,
      sourceDetail: `Meta lead form ${formId ?? '?'} (leadgen ${leadgenId})`,
      externalRef: `meta:leadgen:${leadgenId}`,
    });
    return result.status === 'created'
      ? { leadgenId, status: 'created', detail: `Lead ${result.leadId}, assigned to ${result.assignedTo?.fullName ?? 'nobody (rotation empty)'}` }
      : { leadgenId, status: 'duplicate', detail: `Already exists as "${result.existingName}" (${result.reason})` };
  }
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
