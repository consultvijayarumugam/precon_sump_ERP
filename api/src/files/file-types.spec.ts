import { describe, expect, it } from 'vitest';
import { detectType, slug } from './file-types.js';

describe('file library type checks', () => {
  it('recognises PDF, PNG and JPEG by their bytes', () => {
    expect(detectType(Buffer.from('%PDF-1.4\n...'))?.mimeType).toBe('application/pdf');
    expect(detectType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.ext).toBe('png');
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))?.ext).toBe('jpg');
  });

  it('rejects everything else, whatever it is called', () => {
    expect(detectType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectType(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBeNull(); // mp4 video
    expect(detectType(Buffer.alloc(0))).toBeNull();
  });

  it('makes safe download names', () => {
    expect(slug('Precon Sump — Brochure 2026!')).toBe('precon-sump-brochure-2026');
    expect(slug('***')).toBe('file');
  });
});
