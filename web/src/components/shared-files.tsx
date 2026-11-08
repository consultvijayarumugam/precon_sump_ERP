import { FileText, Image as ImageIcon } from "lucide-react";
import type { SharedFile } from "@/lib/files";

/** The library files sent as links with a WhatsApp message, as small linked chips. */
export function SharedFiles({ files }: { files: SharedFile[] | null | undefined }) {
  if (!files?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-neutral-500">Shared:</span>
      {files.map((f) => {
        const Icon = f.kind === "pdf" ? FileText : ImageIcon;
        return (
          <a
            key={f.id}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:underline dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <Icon className="size-3" aria-hidden />
            {f.title}
            <span className="font-normal text-emerald-700/70 dark:text-emerald-300/70">· {f.category}</span>
          </a>
        );
      })}
    </span>
  );
}
