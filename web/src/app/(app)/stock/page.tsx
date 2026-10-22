"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonSmClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  overdueRowClass,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime, formatLitres } from "@/lib/crm";
import { Product, StockMovement } from "@/lib/finance";
import { MODULES } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

const REASON_LABELS: Record<StockMovement["reason"], string> = {
  OPENING: "Opening stock",
  PRODUCTION: "Production",
  DELIVERY: "Delivery",
  ADJUSTMENT: "Adjustment",
};

type ActionMode = "none" | "produce" | "adjust" | "threshold";

/** The "+ Add production / Adjust / Set alert level" buttons and their inline form, for one stock item. */
function StockActions({ product, onChange }: { product: Product; onChange: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = useState<ActionMode>("none");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [threshold, setThreshold] = useState(String(product.lowStockThreshold));
  const { run, busy, error } = useAction();
  if (!can(TAGS.STOCK_WRITE)) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      mode === "threshold"
        ? apiPatch(`/stock/${product.id}`, { lowStockThreshold: Number(threshold) })
        : apiPost(`/stock/${product.id}/movements`, {
            change: Number(qty),
            reason: mode === "produce" ? "PRODUCTION" : "ADJUSTMENT",
            note: note || undefined,
          }),
    );
    if (ok) {
      setMode("none");
      setQty("");
      setNote("");
      onChange();
    }
  }

  if (mode === "none") {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        <button className={secondaryButtonSmClass} onClick={() => setMode("produce")}>
          + Production
        </button>
        <button className={secondaryButtonSmClass} onClick={() => setMode("adjust")}>
          Adjust
        </button>
        <button className={secondaryButtonSmClass} onClick={() => setMode("threshold")}>
          Alert level
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 text-left">
      <p className="text-xs font-semibold">{product.name}</p>
      {mode === "threshold" ? (
        <Field label={`Alert when at or below (${product.unit})`}>
          <input className={inputClass} type="number" min="0" required value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={mode === "produce" ? `Quantity produced (${product.unit})` : `Change (+ add / − remove)`}>
            <input
              className={inputClass}
              type="number"
              required
              min={mode === "produce" ? 1 : undefined}
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <input
              className={inputClass}
              placeholder={mode === "produce" ? "e.g. Batch 42 cured, passed QC" : "e.g. 1 damaged in yard"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      )}
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonSmClass} disabled={busy}>
          Save
        </button>
        <button type="button" className="text-xs text-neutral-500" onClick={() => setMode("none")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LowFlag({ product }: { product: Product }) {
  return product.isLow ? (
    <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">Low</span>
  ) : (
    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">OK</span>
  );
}

/** All sump sizes together: one row per size with its own count and alert level. */
function SumpPanel({ sizes, onChange }: { sizes: Product[]; onChange: () => void }) {
  const total = sizes.reduce((n, p) => n + p.quantityOnHand, 0);
  const low = sizes.filter((p) => p.isLow).length;
  return (
    <section className={`${panelClass} relative overflow-hidden`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${MODULES.operations.dot}`} aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-3 pt-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Sump</h2>
          <p className="text-sm text-neutral-500">
            {sizes.length} sizes · {total} nos on hand in total
          </p>
        </div>
        {low > 0 ? (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-950 dark:text-red-300">
            {low} size{low === 1 ? "" : "s"} low
          </span>
        ) : (
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">All sizes above alert level</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Size</th>
              <th className={`${thClass} text-right`}>On hand</th>
              <th className={`${thClass} text-right`}>Alert at</th>
              <th className={thClass}>Status</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {sizes.map((p) => (
              <tr key={p.id} className={p.isLow ? overdueRowClass : ""}>
                <td className={`${tdClass} font-semibold`}>{p.sizeLitres ? formatLitres(p.sizeLitres) : p.name}</td>
                <td className={`${tdClass} text-right text-lg font-bold tabular-nums ${p.isLow ? "text-red-700 dark:text-red-300" : ""}`}>
                  {p.quantityOnHand} <span className="text-xs font-normal text-neutral-500">{p.unit}</span>
                </td>
                <td className={`${tdClass} text-right tabular-nums text-neutral-500`}>{p.lowStockThreshold}</td>
                <td className={tdClass}>
                  <LowFlag product={p} />
                </td>
                <td className={`${tdClass} w-[22rem]`}>
                  <StockActions product={p} onChange={onChange} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Microbes: a single stock count with one alert level. */
function MicrobesPanel({ product, onChange }: { product: Product; onChange: () => void }) {
  return (
    <section className={`${panelClass} relative overflow-hidden p-5 ${product.isLow ? "ring-1 ring-red-300 dark:ring-red-900" : ""}`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${MODULES.operations.dot}`} aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Microbes</h2>
          <p className="text-sm text-neutral-500">Alert at {product.lowStockThreshold} {product.unit}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${product.isLow ? "text-red-700 dark:text-red-300" : ""}`}>
            {product.quantityOnHand} <span className="text-base font-normal text-neutral-500">{product.unit}</span>
          </p>
          <div className="mt-1">
            <LowFlag product={product} />
          </div>
        </div>
        <div className="min-w-64 flex-1 sm:max-w-md">
          <StockActions product={product} onChange={onChange} />
        </div>
      </div>
    </section>
  );
}

/** Production stock (#6): finished goods on hand, low-stock flags, movement log. */
export default function StockPage() {
  const { can } = useAuth();
  const stock = useApi<{ lowCount: number; items: Product[] }>(can(TAGS.STOCK_READ) ? "/stock" : null);
  const movements = useApi<StockMovement[]>(can(TAGS.STOCK_READ) ? "/stock/movements" : null);
  if (!can(TAGS.STOCK_READ)) return <NoAccess tag={TAGS.STOCK_READ} />;

  const reload = () => {
    stock.reload();
    movements.reload();
  };

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Production stock" />
        <p className="text-sm text-neutral-500">
          Finished goods ready to deliver: each sump size is counted separately. Marking a sales order delivered
          reduces the right size automatically.
        </p>
      </div>
      <ErrorText error={stock.error ?? movements.error} />
      {stock.data && (
        <>
          <SumpPanel sizes={stock.data.items.filter((p) => p.code === "SUMP")} onChange={reload} />
          {stock.data.items
            .filter((p) => p.code === "MICROBES")
            .map((p) => (
              <MicrobesPanel key={p.id} product={p} onChange={reload} />
            ))}
        </>
      )}

      <section>
        <h2 className="mb-2 font-medium">Recent stock movements</h2>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>When</th>
                <th className={thClass}>Product</th>
                <th className={`${thClass} text-right`}>Change</th>
                <th className={thClass}>Reason</th>
                <th className={thClass}>Note</th>
                <th className={thClass}>By</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {movements.data?.map((m) => (
                <tr key={m.id}>
                  <td className={tdClass}>{formatDateTime(m.createdAt)}</td>
                  <td className={tdClass}>{m.product.name}</td>
                  <td className={`${tdClass} text-right font-medium ${m.change < 0 ? "text-red-600" : "text-green-700"}`}>
                    {m.change > 0 ? `+${m.change}` : m.change} {m.product.unit}
                  </td>
                  <td className={tdClass}>{REASON_LABELS[m.reason]}</td>
                  <td className={tdClass}>
                    {m.salesOrder && can(TAGS.SALES_READ) ? (
                      <Link href={`/orders/${m.salesOrder.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
                        {m.note}
                      </Link>
                    ) : (
                      m.note
                    )}
                  </td>
                  <td className={tdClass}>{m.createdBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
