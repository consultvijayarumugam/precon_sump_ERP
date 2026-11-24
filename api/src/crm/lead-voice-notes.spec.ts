import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { LeadVoiceNotesService } from './lead-voice-notes.service.js';
import { detectAudio, formatDuration, voiceNoteProblem } from './voice-note-audio.js';

const m4a = () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(200, 1)]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 2)]);
const ogg = () => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 3)]);
const amr3gp = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp3gp4'), Buffer.alloc(200, 4)]);
const file = (buffer: Buffer) => ({ buffer, size: buffer.length });

const tara: AuthenticatedUser = {
  id: 'tara',
  email: 't@x.in',
  fullName: 'Tara Telecaller',
  role: { key: 'telecaller', name: 'Telecaller' },
  permissions: ['leads.read', 'leads.qualify', 'leads.auto_assign'],
  modules: ['crm'],
  token: { jti: 'j', expiresAt: new Date() },
};

describe('voice note recordings: what is accepted', () => {
  it('recognises the real formats by their bytes: phone M4A, browser WebM/Ogg', () => {
    expect(detectAudio(m4a())).toEqual({ mimeType: 'audio/mp4', ext: 'm4a' });
    expect(detectAudio(webm())).toEqual({ mimeType: 'audio/webm', ext: 'webm' });
    expect(detectAudio(ogg())).toEqual({ mimeType: 'audio/ogg', ext: 'ogg' });
  });

  it("refuses 3GP/AMR (browsers can't play it), PDFs, HTML and junk", () => {
    expect(detectAudio(amr3gp())).toBeNull();
    expect(detectAudio(Buffer.from('%PDF-1.7 aaaaaaaaaa'))).toBeNull();
    expect(detectAudio(Buffer.from('<html><script>x</script></html>'))).toBeNull();
    expect(detectAudio(Buffer.from('tiny'))).toBeNull();
  });

  it('caps at about 2 minutes and 3 MB, and refuses empty or tiny recordings', () => {
    expect(voiceNoteProblem(file(m4a()), 42_000)).toBeNull();
    expect(voiceNoteProblem(file(m4a()), 121_500)).toBeNull(); // recorder stopped a moment late
    expect(voiceNoteProblem(file(m4a()), 130_000)).toMatch(/up to 2 minutes/);
    expect(voiceNoteProblem(file(m4a()), 200)).toMatch(/too short/);
    expect(voiceNoteProblem(undefined, 5000)).toMatch(/No recording/);
    expect(voiceNoteProblem({ buffer: m4a(), size: 4 * 1024 * 1024 }, 5000)).toMatch(/too large/);
    expect(voiceNoteProblem(file(amr3gp()), 5000)).toMatch(/isn't a supported recording/);
  });

  it('shows durations as m:ss', () => {
    expect(formatDuration(42_000)).toBe('0:42');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(120_000)).toBe('2:00');
  });
});

describe('saving and playing voice notes', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'voice-'));
    process.env.VOICE_NOTE_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.VOICE_NOTE_DIR;
  });

  function setup({ visible = true, failSave = false } = {}) {
    const activities: { type: string; message: string; userId: string }[] = [];
    const notifications: { userId: string; title: string }[] = [];
    const created: { storedName: string; durationMs: number; mimeType: string; authorId: string }[] = [];
    const leadQueries: unknown[] = [];
    const db = {
      lead: {
        findFirst: vi.fn(async (args: unknown) => {
          leadQueries.push(args);
          return visible ? { id: 'lead-1', name: 'Ravi', phone: '+919000000001', assignedToId: 'suresh', telecallerId: 'tara' } : null;
        }),
      },
      leadVoiceNote: {
        create: vi.fn(async ({ data }: { data: (typeof created)[number] }) => {
          if (failSave) throw new Error('database down');
          created.push(data);
          return { id: 'vn-1', durationMs: data.durationMs };
        }),
        findFirst: vi.fn(async () => (created[0] ? { storedName: created[0].storedName, mimeType: created[0].mimeType } : null)),
        findMany: vi.fn(async () => []),
      },
      leadActivity: { create: vi.fn(async ({ data }: { data: (typeof activities)[number] }) => activities.push(data)) },
      notification: { createMany: vi.fn(async ({ data }: { data: typeof notifications }) => notifications.push(...data)) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    };
    return { service: new LeadVoiceNotesService(db as never), activities, notifications, created, leadQueries };
  }

  it('stores the recording under an unguessable name, logs "Voice note added by <name>" and tells the salesperson', async () => {
    const { service, activities, notifications, created } = setup();
    await service.add(tara, 'lead-1', file(m4a()), 42_000);
    expect(created[0]).toMatchObject({ authorId: 'tara', durationMs: 42_000, mimeType: 'audio/mp4' });
    expect(created[0].storedName).toMatch(/^[A-Za-z0-9_-]{32}\.m4a$/);
    expect(readdirSync(dir)).toEqual([created[0].storedName]);
    expect(activities).toEqual([expect.objectContaining({ type: 'VOICE_NOTE', userId: 'tara', message: 'Voice note added by Tara Telecaller (0:42)' })]);
    expect(notifications).toEqual([expect.objectContaining({ userId: 'suresh', title: 'Voice note from Tara Telecaller on Ravi' })]);

    const played = await service.audio(tara, 'lead-1', 'vn-1');
    expect(played).toMatchObject({ mimeType: 'audio/mp4', ext: '.m4a' });
    expect(existsSync(played.absolutePath)).toBe(true);
  });

  it('two notes on one lead get different files', async () => {
    const { service, created } = setup();
    await service.add(tara, 'lead-1', file(webm()), 3_000);
    await service.add(tara, 'lead-1', file(m4a()), 4_000);
    expect(created[0].storedName).not.toBe(created[1].storedName);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('a bad recording is refused before anything is written', async () => {
    const { service, created } = setup();
    await expect(service.add(tara, 'lead-1', file(amr3gp()), 5_000)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.add(tara, 'lead-1', file(m4a()), 600_000)).rejects.toThrow(/2 minutes/);
    expect(created).toHaveLength(0);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("if saving fails, the file isn't left behind", async () => {
    const { service } = setup({ failSave: true });
    await expect(service.add(tara, 'lead-1', file(m4a()), 5_000)).rejects.toThrow('database down');
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("someone who can't see the lead gets 404 for listing, recording and playing (lead scope applies)", async () => {
    const { service, leadQueries } = setup({ visible: false });
    await expect(service.list(tara, 'lead-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.add(tara, 'lead-1', file(m4a()), 5_000)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.audio(tara, 'lead-1', 'vn-1')).rejects.toBeInstanceOf(NotFoundException);
    // The telecaller's scope: leads assigned to them or that they worked.
    expect(JSON.stringify(leadQueries[0])).toContain('"telecallerId":"tara"');
    expect(readdirSync(dir)).toHaveLength(0);
  });
});
