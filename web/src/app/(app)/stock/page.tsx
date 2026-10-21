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
  PageHeader,
  secondaryButtonSmClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { Product, StockMovement } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

const REASON_LABELS: Record<StockMovement["reason"], string> = {
  OPENING: "Opening stock",
  PRODUCTION: "Production",
  DELIVERY: "Delivery",
  ADJUSTMENT: "Adjustment",
};

function ProductCard({ product, onChange }: { product: Product; onChange: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = useState<"none" | "produce" | "adjust" | "threshold">("none");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [threshold, setThreshold] = useState(String(product.lowStockThreshold));
  const { run, busy, error } = useAction();

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

  return (
    <div
      className={`rounded border p-4 ${
        product.isLow ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{product.name}</div>
          <div className="text-xs text-neutral-500">
            Low-stock alert at {product.lowStockThreshold} {product.unit}
          </div>
        </div>
        {product.isLow && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Low stock</span>}
      </div>
      <div className="mt-3 text-3xl font-semibold">
        {product.quantityOnHand} <span className="text-base font-normal text-neutral-500">{product.unit}</span>
      </div>

      {can(TAGS.STOCK_WRITE) && mode === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={secondaryButtonSmClass} onClick={() => setMode("produce")}>
            + Add production
          </button>
          <button className={secondaryButtonSmClass} onClick={() => setMode("adjust")}>
            Adjust
          </button>
          <button className={secondaryButtonSmClass} onClick={() => setMode("threshold")}>
            Set alert level
          </button>
        </div>
      )}

      {mode !== "none" && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          {mode === "threshold" ? (
            <Field label={`Alert when at or below (${product.unit})`}>
              <input className={inputClass} type="number" min="0" required value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label={mode === "produce" ? `Quantity produced (${product.unit})` : `Change (+ add / − remove, ${product.unit})`}>
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
                  placeholder={mode === "produce" ? "e.g. Batch 42 passed QC" : "e.g. 1 damaged in yard"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </>
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
      )}
    </div>
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
          Finished goods ready to deliver. Marking a sales order delivered reduces stock automatically.
        </p>
      </div>
      <ErrorText error={stock.error ?? movements.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        {stock.data?.items.map((p) => (
          <ProductCard key={p.id} product={p} onChange={reload} />
        ))}
      </div>

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
