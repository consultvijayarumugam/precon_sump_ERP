/**
 * What the library accepts. The type is decided from the file's first bytes
 * (its "magic number"), not the name or the browser's claim, because these
 * files are served publicly: a renamed HTML or script file must never get in.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type FileKind = 'pdf' | 'image';

/** The parts of a multer upload the library uses. */
export interface UploadedBytes {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}

interface AllowedType {
  mimeType: string;
  ext: string;
  kind: FileKind;
  matches: (head: Buffer) => boolean;
}

const startsWith = (head: Buffer, bytes: number[]) => bytes.every((b, i) => head[i] === b);

export const ALLOWED_TYPES: AllowedType[] = [
  { mimeType: 'application/pdf', ext: 'pdf', kind: 'pdf', matches: (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  { mimeType: 'image/png', ext: 'png', kind: 'image', matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mimeType: 'image/jpeg', ext: 'jpg', kind: 'image', matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
];

/** The allowed type these bytes really are, or null. */
export const detectType = (data: Buffer) => ALLOWED_TYPES.find((t) => t.matches(data.subarray(0, 16))) ?? null;

export const kindOf = (mimeType: string): FileKind => (mimeType === 'application/pdf' ? 'pdf' : 'image');

export const ALLOWED_LABEL = 'PDF, JPG or PNG';

/** "Precon Sump Brochure 2026" -> "precon-sump-brochure-2026" (for the download name). */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'file';
