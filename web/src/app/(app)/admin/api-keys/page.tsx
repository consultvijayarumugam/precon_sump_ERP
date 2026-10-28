"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string };
}

interface MetaStatus {
  verifyTokenSet: boolean;
  appSecretSet: boolean;
  pageAccessTokenSet: boolean;
  graphApiVersion: string;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={secondaryButtonSmClass}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard needs HTTPS or localhost; on a LAN address select the text instead.
          window.prompt("Copy this:", text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-3 pr-20 text-xs leading-relaxed text-neutral-100">{children}</pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={children} />
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};

/** Admin → API keys: keys for the public create-lead API (#21), plus its documentation. */
export default function ApiKeysPage() {
  const { can } = useAuth();
  const { data: keys, error, reload } = useApi<ApiKeyRow[]>("/api-keys");
  const { data: meta } = useApi<MetaStatus>("/api-keys/meta-status");
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "http://<server>:3000");
  const create = useAction();
  const revoke = useAction();

  if (!can(TAGS.APIKEYS_MANAGE)) return <NoAccess tag={TAGS.APIKEYS_MANAGE} />;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const ok = await create.run(async () => {
      const created = await apiPost<ApiKeyRow & { key: string }>("/api-keys", { name });
      setNewKey({ name: created.name, key: created.key });
    });
    if (ok) {
      setName("");
      reload();
    }
  }

  async function handleRevoke(key: ApiKeyRow) {
    if (!window.confirm(`Revoke "${key.name}"? Systems using it will be rejected immediately. This can't be undone.`)) return;
    if (await revoke.run(() => apiPost(`/api-keys/${key.id}/revoke`))) reload();
  }

  const endpoint = `${origin}/api/v1/public/leads`;
  const exampleKey = newKey?.key ?? "precon_your_key_here";
  const curl = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${exampleKey}" \\
  -d '{
    "name": "Ravi Kumar",
    "phone": "+91 98765 43210",
    "product": "SUMP",
    "sumpSizeLitres": 10000,
    "city": "Coimbatore",
    "notes": "Asked for a quote on the website",
    "externalId": "form-2026-10-22-0042"
  }'`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        subtitle="Let other systems (your website form, a partner CRM) create leads in Precon. Each key is shown only once; revoke a key to cut its access."
      />

      {newKey && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40" role="alert">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Key for &ldquo;{newKey.name}&rdquo; created. Copy it now.</p>
          <p className="mb-3 text-sm text-emerald-800 dark:text-emerald-300">
            Only a scrambled (hashed) copy is stored, so this full key can&apos;t be shown again. If it&apos;s lost, revoke it and create a new one.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-white px-3 py-1.5 font-mono text-sm break-all ring-1 ring-emerald-200 dark:bg-neutral-900 dark:ring-emerald-800">
              {newKey.key}
            </code>
            <CopyButton text={newKey.key} label="Copy key" />
            <button type="button" className="text-sm text-emerald-800 underline dark:text-emerald-300" onClick={() => setNewKey(null)}>
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className={`${panelClass} flex flex-wrap items-end gap-3 p-5`}>
        <div className="min-w-64 flex-1">
          <Field label="Name (who will use this key)">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website contact form"
              minLength={3}
              maxLength={80}
              required
            />
          </Field>
        </div>
        <button type="submit" className={buttonClass} disabled={create.busy}>
          <KeyRound className="size-4" aria-hidden /> Generate key
        </button>
        {create.error && <p className="w-full text-sm font-medium text-red-600">{create.error}</p>}
      </form>

      <ErrorText error={error ?? revoke.error} />
      {keys && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Key starts with</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Last used</th>
                <th className={thClass}>Created</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {keys.length === 0 && (
                <tr>
                  <td className={`${tdClass} text-neutral-500`} colSpan={6}>
                    No API keys yet.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-60" : undefined}>
                  <td className={`${tdClass} font-medium`}>{k.name}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{k.prefix}…</td>
                  <td className={tdClass}>
                    {k.revokedAt ? <Badge tone="neutral">Revoked {formatDateTime(k.revokedAt)}</Badge> : <Badge tone="green">Active</Badge>}
                  </td>
                  <td className={tdClass}>{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}</td>
                  <td className={tdClass}>
                    {formatDateTime(k.createdAt)}
                    <div className="text-xs text-neutral-500">by {k.createdBy.fullName}</div>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    {!k.revokedAt && (
                      <button type="button" className={`${secondaryButtonSmClass} text-red-700 dark:text-red-300`} disabled={revoke.busy} onClick={() => handleRevoke(k)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className={`${panelClass} space-y-4 p-5 text-sm`}>
        <h2 className="text-lg font-bold tracking-tight">How to use: create a lead</h2>
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-neutral-500">URL</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="font-mono break-all">POST {endpoint}</code>
          </dd>
          <dt className="font-medium text-neutral-500">Headers</dt>
          <dd>
            <code className="font-mono">Content-Type: application/json</code>
            <br />
            <code className="font-mono">X-API-Key: &lt;your key&gt;</code>
          </dd>
          <dt className="font-medium text-neutral-500">Rate limit</dt>
          <dd>60 requests per minute per key (set by PUBLIC_API_RATE_LIMIT). Over the limit you get 429 with a Retry-After header.</dd>
        </dl>

        <div>
          <h3 className="mb-1 font-semibold">JSON body</h3>
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Field</th>
                  <th className={thClass}>Required</th>
                  <th className={thClass}>Notes</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {[
                  ["name", "yes", "2-120 characters"],
                  ["phone", "yes", "10-15 digits; spaces, dashes and + are fine"],
                  ["product", "yes", "SUMP or MICROBES"],
                  ["sumpSizeLitres", "no", "SUMP only: 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000 or 20000"],
                  ["city", "no", "up to 80 characters"],
                  ["email", "no", "a valid email"],
                  ["notes", "no", "up to 2000 characters"],
                  ["source", "no", "API (default), WEBSITE, REFERRAL or OTHER"],
                  ["externalId", "no", "your id for this submission; resending it is reported as a duplicate"],
                ].map(([f, r, n]) => (
                  <tr key={f}>
                    <td className={`${tdClass} font-mono`}>{f}</td>
                    <td className={tdClass}>{r}</td>
                    <td className={tdClass}>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Example</h3>
          <CodeBlock>{curl}</CodeBlock>
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Responses</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>201</strong> <code className="font-mono">{`{"status":"created","leadId":"…"}`}</code>: new lead (source &ldquo;External system (API)&rdquo;
              unless you send another source; the lead shows which key created it).
            </li>
            <li>
              <strong>200</strong> <code className="font-mono">{`{"status":"duplicate","reason":"phone"|"externalId","leadId":"…"}`}</code>: a lead with
              this phone (last 10 digits) or externalId already exists. Nothing is created.
            </li>
            <li>
              <strong>400</strong>: invalid input; <code className="font-mono">message</code> lists what&apos;s wrong.
            </li>
            <li>
              <strong>401</strong>: missing, wrong or revoked key. <strong>429</strong>: too many requests.
            </li>
          </ul>
          <p className="mt-2 text-neutral-500">New API leads are unassigned and appear in All leads for an admin to assign.</p>
        </div>
      </section>

      <section className={`${panelClass} space-y-3 p-5 text-sm`}>
        <h2 className="text-lg font-bold tracking-tight">Meta (Facebook) lead ads webhook</h2>
        <p>
          Callback URL for the Meta app: <code className="font-mono break-all">https://&lt;your-public-domain&gt;/api/v1/webhooks/meta</code> (must be a
          public HTTPS address; a LAN address won&apos;t work for Meta). Leads arrive with source &ldquo;Meta&rdquo;; duplicates are skipped.
        </p>
        {meta && (
          <ul className="space-y-1">
            {[
              ["META_VERIFY_TOKEN", meta.verifyTokenSet],
              ["META_APP_SECRET", meta.appSecretSet],
              ["META_PAGE_ACCESS_TOKEN", meta.pageAccessTokenSet],
            ].map(([n, set]) => (
              <li key={n as string} className="flex items-center gap-2">
                <code className="font-mono">{n}</code>
                {set ? <Badge tone="green">set</Badge> : <Badge tone="amber">not set</Badge>}
              </li>
            ))}
            <li>
              Graph API version: <code className="font-mono">{meta.graphApiVersion}</code>
            </li>
          </ul>
        )}
        <p className="text-neutral-500">These are server environment variables (api/.env), never stored in the app. See the README for the Meta-side setup.</p>
      </section>
    </div>
  );
}
