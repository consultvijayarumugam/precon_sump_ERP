/**
 * Two sample library files so the WhatsApp file picker can be demoed: a
 * one-page brochure PDF and a product image (PNG), both generated here so no
 * binaries live in git. Added only when missing (matched by title); if a row
 * exists but its file was wiped from disk, the file is written again.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { FileCategory, PrismaClient } from '../src/generated/prisma/client.js';
import { storageDir } from '../src/files/files.service.js';

const SUMP_SIZES = [3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000];

/** A minimal, valid one-page PDF (Helvetica text, a blue header band). */
export function brochurePdf(): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = (x: number, y: number, size: number, t: string, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`;
  const lines = [
    '0.06 0.31 0.65 rg 0 742 595 100 re f', // header band
    '1 1 1 rg',
    text(48, 790, 28, 'Precon Sump', true),
    text(48, 762, 13, 'Precast concrete sumps and microbes  -  DEMO BROCHURE'),
    '0.1 0.1 0.15 rg',
    text(48, 700, 16, 'Precast concrete sumps', true),
    text(48, 678, 11, 'Factory-cast, leak-proof, ready to install in a day. Available sizes (litres):'),
    ...SUMP_SIZES.map((s, i) => text(64 + (i % 3) * 160, 650 - Math.floor(i / 3) * 22, 12, `-  ${s.toLocaleString('en-IN')} L`)),
    text(48, 560, 16, 'Microbes', true),
    text(48, 538, 11, 'Bio-culture packs that keep sumps and septic systems clean and odour-free.'),
    text(48, 470, 16, 'Why Precon', true),
    text(64, 448, 11, '-  Precast in a controlled factory: consistent strength and finish'),
    text(64, 430, 11, '-  Faster site work: no curing time on site'),
    text(64, 412, 11, '-  Installation and after-sales service by our own team'),
    '0.45 0.45 0.5 rg',
    text(48, 60, 9, 'Sample file seeded for testing the file library. Replace it with your real brochure in Admin > Files.'),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(lines)} >>\nstream\n${lines}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A 640x400 PNG: a concrete sump cut-away holding water, on a sky-to-ground background. */
export function productPng(width = 640, height = 400): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const put = (x: number, y: number, [r, g, b]: number[]) => {
    const i = y * (width * 3 + 1) + 1 + x * 3;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
  };
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const [left, right, top, bottom, wall] = [170, 470, 120, 350, 22];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = y < 150 ? mix([222, 236, 252], [186, 214, 246], y / 150) : mix([196, 178, 150], [150, 128, 100], (y - 150) / 250); // sky / soil
      const inSump = x >= left && x <= right && y >= top && y <= bottom;
      if (inSump) {
        const inner = x > left + wall && x < right - wall && y > top + wall && y < bottom - wall;
        c = inner ? (y > 190 ? mix([84, 152, 231], [16, 66, 129], (y - 190) / 140) : [236, 240, 245]) : mix([168, 170, 176], [128, 130, 138], (y - top) / (bottom - top)); // water / concrete
      }
      if (y >= top - 14 && y < top && x >= left - 20 && x <= right + 20) c = [118, 120, 128]; // lid slab
      put(x, y, c);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const SAMPLES: { title: string; category: FileCategory; mimeType: string; ext: string; originalName: string; make: () => Buffer }[] = [
  { title: 'Precon Sump brochure (demo)', category: 'BROCHURE', mimeType: 'application/pdf', ext: 'pdf', originalName: 'precon-sump-brochure-demo.pdf', make: brochurePdf },
  { title: 'Sump product photo (demo)', category: 'PRODUCT_IMAGE', mimeType: 'image/png', ext: 'png', originalName: 'sump-product-demo.png', make: productPng },
];

export async function seedLibraryFiles(prisma: PrismaClient) {
  await mkdir(storageDir(), { recursive: true });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@precon.local' }, select: { id: true } });
  let added = 0;
  for (const sample of SAMPLES) {
    const existing = await prisma.libraryFile.findFirst({ where: { title: sample.title }, select: { storedName: true } });
    if (existing) {
      const onDisk = path.join(storageDir(), existing.storedName);
      if (!existsSync(onDisk)) await writeFile(onDisk, sample.make());
      continue;
    }
    const token = randomBytes(24).toString('base64url');
    const data = sample.make();
    await writeFile(path.join(storageDir(), `${token}.${sample.ext}`), data);
    await prisma.libraryFile.create({
      data: {
        token,
        storedName: `${token}.${sample.ext}`,
        title: sample.title,
        category: sample.category,
        mimeType: sample.mimeType,
        sizeBytes: data.length,
        originalName: sample.originalName,
        uploadedById: admin?.id,
      },
    });
    added += 1;
  }
  console.log(added ? `Added ${added} sample library file(s).` : 'Sample library files already exist.');
}
