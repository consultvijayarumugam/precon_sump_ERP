import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { FileCategory, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateFileDto, UploadFileDto } from './dto/files.dto.js';
import { ALLOWED_LABEL, detectType, kindOf, MAX_FILE_BYTES, slug, type UploadedBytes } from './file-types.js';

export const FILE_SELECT = {
  id: true,
  token: true,
  title: true,
  category: true,
  mimeType: true,
  sizeBytes: true,
  originalName: true,
  storedName: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.LibraryFileSelect;

type FileRow = Prisma.LibraryFileGetPayload<{ select: typeof FILE_SELECT }>;

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  BROCHURE: 'Brochure',
  PRICE_LIST: 'Price list',
  PRODUCT_IMAGE: 'Product image',
  SPEC_SHEET: 'Spec sheet',
  WARRANTY: 'Warranty',
  OTHER: 'Other',
};

/** Where uploads live on disk (outside the code; git-ignored by default). */
export const storageDir = () => path.resolve(process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'library'));

/**
 * The address customers open the links on. Set PUBLIC_FILE_BASE_URL to the
 * public site (e.g. https://crm.example.com) in production; otherwise the
 * address staff are using now (the web app forwards /api/v1 to the API).
 */
export function publicBase(req?: Request) {
  const configured = process.env.PUBLIC_FILE_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (!req) return 'http://localhost:4000';
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0].trim();
  const host = first(req.headers['x-forwarded-host']) || req.headers.host || 'localhost:4000';
  const proto = first(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  return `${proto}://${host}`;
}

/** Shared file library: brochures, price lists and product photos staff send as WhatsApp links. */
@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The public link: the token is the secret; the name at the end is just for a readable URL. */
  linkFor(file: Pick<FileRow, 'token' | 'title' | 'storedName'>, base: string) {
    return `${base}/api/v1/f/${file.token}/${slug(file.title)}${path.extname(file.storedName)}`;
  }

  present(file: FileRow, base: string) {
    const { storedName: _stored, token: _token, ...rest } = file;
    return {
      ...rest,
      kind: kindOf(file.mimeType),
      categoryLabel: CATEGORY_LABELS[file.category],
      url: this.linkFor(file, base),
    };
  }

  async list(base: string) {
    const files = await this.prisma.libraryFile.findMany({ orderBy: [{ category: 'asc' }, { title: 'asc' }], select: FILE_SELECT });
    return files.map((f) => this.present(f, base));
  }

  async upload(file: UploadedBytes | undefined, dto: UploadFileDto, userId: string, base: string) {
    if (!file?.buffer?.length) throw new BadRequestException(`Choose a file to upload (${ALLOWED_LABEL}, up to 10 MB)`);
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException(this.tooBig(file.size));
    const type = detectType(file.buffer);
    if (!type) {
      const video = file.mimetype?.startsWith('video/');
      throw new BadRequestException(
        `"${file.originalname}" isn't a ${ALLOWED_LABEL} file${video ? ' (videos are not supported yet)' : ''}. Only PDFs and JPG/PNG images can be uploaded.`,
      );
    }
    const token = randomBytes(24).toString('base64url'); // 32 characters, unguessable
    const storedName = `${token}.${type.ext}`;
    await mkdir(storageDir(), { recursive: true });
    await writeFile(path.join(storageDir(), storedName), file.buffer, { flag: 'wx' });
    try {
      const created = await this.prisma.libraryFile.create({
        data: {
          token,
          storedName,
          title: dto.title,
          category: dto.category ?? 'OTHER',
          mimeType: type.mimeType,
          sizeBytes: file.size,
          originalName: file.originalname.slice(0, 200),
          uploadedById: userId,
        },
        select: FILE_SELECT,
      });
      return this.present(created, base);
    } catch (error) {
      await rm(path.join(storageDir(), storedName), { force: true });
      throw error;
    }
  }

  async update(id: string, dto: UpdateFileDto, base: string) {
    await this.get(id);
    return this.present(await this.prisma.libraryFile.update({ where: { id }, data: dto, select: FILE_SELECT }), base);
  }

  /** Removes the file and its link. Messages already sent keep the file's name in the lead history. */
  async delete(id: string) {
    const file = await this.get(id);
    await this.prisma.libraryFile.delete({ where: { id } });
    await rm(path.join(storageDir(), file.storedName), { force: true });
  }

  /** For the public link: the file on disk and how to serve it, or 404. */
  async forToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('File not found');
    const file = await this.prisma.libraryFile.findUnique({ where: { token }, select: FILE_SELECT });
    if (!file) throw new NotFoundException('File not found');
    return { file, absolutePath: path.join(storageDir(), file.storedName), downloadName: `${slug(file.title)}${path.extname(file.storedName)}` };
  }

  /** The chosen files, in the order picked; 400 if any is gone. */
  async pick(ids: string[]) {
    if (!ids.length) return [];
    const files = await this.prisma.libraryFile.findMany({ where: { id: { in: ids } }, select: FILE_SELECT });
    if (files.length !== new Set(ids).size) throw new BadRequestException('One of the chosen files was removed from the library. Pick again.');
    return [...new Set(ids)].map((id) => files.find((f) => f.id === id)!);
  }

  private async get(id: string) {
    const file = await this.prisma.libraryFile.findUnique({ where: { id }, select: FILE_SELECT });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  private tooBig(bytes: number) {
    return `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB per file.`;
  }
}
