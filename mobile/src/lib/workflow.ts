// Types and rules of the telecaller workflow, mirroring the API and web/src/lib/workflow.ts.

export const CALL_OUTCOMES = ['NO_ANSWER', 'BUSY', 'CALL_BACK', 'INTERESTED', 'NOT_INTERESTED', 'WRONG_NUMBER'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  CALL_BACK: 'Call back later',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  WRONG_NUMBER: 'Wrong number',
};

/** These close the lead as Lost (and it leaves the worklist). */
export const CLOSING_OUTCOMES: CallOutcome[] = ['NOT_INTERESTED', 'WRONG_NUMBER'];

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'QUOTED' | 'WON' | 'LOST';
export type ProductInterest = 'SUMP' | 'MICROBES';
export type WorklistBucket = 'overdue' | 'today' | 'new' | 'no_next_step' | 'later';

export const BUCKET_ORDER: WorklistBucket[] = ['overdue', 'today', 'new', 'no_next_step', 'later'];

export const BUCKET_LABELS: Record<WorklistBucket, string> = {
  overdue: 'Overdue callbacks',
  today: 'Callbacks due today',
  new: 'New: not called yet',
  no_next_step: 'Called, no callback set',
  later: 'Callbacks later',
};

export const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta (Facebook)',
  MANUAL: 'Manual',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  OTHER: 'Other',
  API: 'External system',
};

export const SUMP_SIZES_LITRES = [3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000];

export const formatLitres = (litres: number) => `${litres.toLocaleString('en-IN')} L`;

export function productLabel(p: { productInterest: ProductInterest | null; sumpSizeLitres?: number | null }): string | null {
  if (!p.productInterest) return null;
  if (p.productInterest === 'MICROBES') return 'Microbes';
  return p.sumpSizeLitres ? `Sump · ${formatLitres(p.sumpSizeLitres)}` : 'Sump (size not decided)';
}

export interface StageRef {
  id: string;
  name: string;
  phase: LeadStatus;
}

export interface WorklistItem {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: LeadStatus;
  stage: StageRef | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  createdAt: string;
  bucket: WorklistBucket;
  nextCallback: { id: string; scheduledAt: string; note: string | null } | null;
  lastCall: { outcome: CallOutcome; note: string | null; calledAt: string } | null;
  callCount: number;
}

export interface TelecallerData {
  counts: { newToday: number; callbacksDueToday: number; overdue: number; callsToday: number; notCalledYet: number };
  items: WorklistItem[];
}

export interface FollowUp {
  id: string;
  scheduledAt: string;
  note: string | null;
  outcome: string | null;
  completedAt: string | null;
}

export interface LeadDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  source: string;
  sourceDetail: string | null;
  status: LeadStatus;
  stage: StageRef | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  notes: string | null;
  createdAt: string;
  assignedTo: { id: string; fullName: string } | null;
  followUps: FollowUp[];
}

export interface CallRow {
  id: string;
  outcome: CallOutcome;
  note: string | null;
  calledAt: string;
  caller: { fullName: string };
}
export interface CallAttemptRow {
  id: string;
  createdAt: string;
  user: { fullName: string };
}
export interface MessageRow {
  id: string;
  templateName: string | null;
  message: string;
  attachments: { id: string; title: string }[] | null;
  createdAt: string;
  user: { fullName: string };
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}
export interface LibraryFile {
  id: string;
  title: string;
  kind: 'pdf' | 'image';
  categoryLabel: string;
}
export interface SalesTeam {
  nextUp: { id: string; fullName: string } | null;
  members: { id: string; fullName: string; inRotation: boolean }[];
}

/** Stages a telecaller can still qualify from. */
export const canBeQualified = (status: LeadStatus) => status === 'NEW' || status === 'CONTACTED';

/** The worklist in call order, one section per non-empty bucket. */
export function toSections(items: WorklistItem[]) {
  return BUCKET_ORDER.map((bucket) => ({ bucket, title: BUCKET_LABELS[bucket], data: items.filter((i) => i.bucket === bucket) })).filter((s) => s.data.length > 0);
}

export function callbackPresets(now = new Date()): { label: string; at: Date }[] {
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  inHour.setSeconds(0, 0);
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  const twoDays = new Date(tomorrow);
  twoDays.setDate(twoDays.getDate() + 1);
  return [
    { label: 'In 1 hour', at: inHour },
    ...(evening.getTime() - now.getTime() > 60 * 60 * 1000 ? [{ label: 'Today 6 pm', at: evening }] : []),
    { label: 'Tomorrow 11 am', at: tomorrow },
    { label: 'In 2 days', at: twoDays },
  ];
}

/** Default next callback for an outcome: soon for no answer, tomorrow for "call back", none otherwise. */
export function defaultCallbackFor(outcome: CallOutcome, now = new Date()): Date | null {
  if (CLOSING_OUTCOMES.includes(outcome) || outcome === 'INTERESTED') return null;
  const presets = callbackPresets(now);
  return outcome === 'CALL_BACK' ? (presets.find((p) => p.label.startsWith('Tomorrow'))?.at ?? presets[0].at) : presets[0].at;
}

const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** "29 Oct, 2:29 pm" */
export const formatDateTime = (at: string | Date) => dateTime.format(new Date(at)).replace(' at ', ', ').replace(/\b(am|pm|AM|PM)\b/, (m) => m.toLowerCase());
