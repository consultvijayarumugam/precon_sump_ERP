// The shared file library (GET /files): brochures, price lists and product
// images staff add to WhatsApp messages as links (wa.me can't carry attachments).
export type FileCategory = "BROCHURE" | "PRICE_LIST" | "PRODUCT_IMAGE" | "SPEC_SHEET" | "WARRANTY" | "OTHER";

export const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: "BROCHURE", label: "Brochure" },
  { key: "PRICE_LIST", label: "Price list" },
  { key: "PRODUCT_IMAGE", label: "Product image" },
  { key: "SPEC_SHEET", label: "Spec sheet" },
  { key: "WARRANTY", label: "Warranty" },
  { key: "OTHER", label: "Other" },
];

export interface LibraryFile {
  id: string;
  title: string;
  category: FileCategory;
  categoryLabel: string;
  kind: "pdf" | "image";
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
  uploadedBy: { id: string; fullName: string } | null;
  /** Public link customers open (no login). */
  url: string;
}

/** A file as recorded on a WhatsApp message in the lead's history. */
export interface SharedFile {
  id: string;
  title: string;
  category: string;
  kind: "pdf" | "image";
  url: string;
}

export const MAX_FILE_MB = 10;
export const ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export const fileTypeLabel = (f: { kind: "pdf" | "image"; mimeType?: string }) =>
  f.kind === "pdf" ? "PDF" : f.mimeType === "image/png" ? "PNG" : f.mimeType === "image/jpeg" ? "JPG" : "Image";

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Client-side check before uploading (the server checks the real contents again). */
export function uploadProblem(file: File): string | null {
  const ok = ["application/pdf", "image/jpeg", "image/png"].includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (file.type.startsWith("video/")) return `"${file.name}" is a video. Videos are not supported yet; upload a PDF, JPG or PNG.`;
  if (!ok) return `"${file.name}" isn't a PDF, JPG or PNG file.`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${MAX_FILE_MB} MB per file.`;
  return null;
}
