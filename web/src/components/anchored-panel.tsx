"use client";

import { ReactNode, RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const desktop = () => window.matchMedia("(min-width: 640px)").matches;

/**
 * A panel opened from a button: a bottom sheet on phones (within thumb reach),
 * a popover under the button on larger screens. Rendered on <body>, so a
 * scrolling table can't clip it.
 */
export function AnchoredPanel({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = panel.current;
    const from = anchor.current?.getBoundingClientRect();
    if (!box || !from || !desktop()) return;
    const { width, height } = box.getBoundingClientRect();
    const below = from.bottom + GAP;
    const top = below + height <= window.innerHeight - GAP ? below : Math.max(GAP, from.top - GAP - height);
    box.style.top = `${top}px`;
    box.style.left = `${Math.min(Math.max(GAP, from.right - width), window.innerWidth - width - GAP)}px`;
  }, [anchor]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // The popover is placed once, so it closes rather than drift from its button.
    const moved = (e: Event) => desktop() && !panel.current?.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/40 sm:bg-transparent" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:inset-x-auto sm:bottom-auto sm:max-h-[80vh] sm:w-96 sm:rounded-xl sm:p-2 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
