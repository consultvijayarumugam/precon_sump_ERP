import { filesToSend, MessagingService } from './messaging.service.js';

describe('files sent with a WhatsApp template', () => {
  it("always include the template's own files, then the picked ones, each once", () => {
    expect(filesToSend(['brochure'], [])).toEqual(['brochure']);
    expect(filesToSend(['brochure'], ['photo', 'brochure'])).toEqual(['brochure', 'photo']);
    expect(filesToSend([], ['photo'])).toEqual(['photo']);
    expect(filesToSend(Array.from({ length: 6 }, (_, i) => `t${i}`), Array.from({ length: 6 }, (_, i) => `p${i}`))).toHaveLength(10);
  });

  it('adds the template file link to the message even when nothing was picked (older app versions too)', async () => {
    const db = {
      lead: { findFirst: vi.fn(async () => ({ id: 'L1', name: 'Ravi Kumar', phone: '9876543210', city: 'Erode', productInterest: 'SUMP', sumpSizeLitres: 5000 })) },
      messageTemplate: { findFirst: vi.fn(async () => ({ id: 'T1', name: 'Intro', body: 'Hi {first_name}', files: [{ id: 'F1' }] })) },
      leadActivity: { create: vi.fn(async () => ({ id: 'A1', createdAt: new Date() })) },
    };
    const files = {
      pick: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, title: 'Precon brochure', category: 'BROCHURE', mimeType: 'application/pdf', token: 'tok' }))),
      linkFor: vi.fn(() => 'https://crm.example/f/tok'),
    };
    const user = { id: 'u', fullName: 'Tara', permissions: [], email: '', role: { key: 'telecaller', name: 'Telecaller' }, modules: [], token: { jti: '', expiresAt: new Date() } };
    const result = await new MessagingService(db as never, files as never).startWhatsApp(user, 'L1', { templateId: 'T1' }, 'https://crm.example');
    expect(files.pick).toHaveBeenCalledWith(['F1']);
    expect(result.message).toBe('Hi Ravi\n\nPrecon brochure: https://crm.example/f/tok');
    expect(result.files.map((f) => f.id)).toEqual(['F1']);
  });
});
