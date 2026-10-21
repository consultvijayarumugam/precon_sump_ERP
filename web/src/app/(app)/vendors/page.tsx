"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  overdueRowClass,
  OverdueTag,
  PageHeader,
  secondaryButtonClass,
  Stat,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPost } from "@/lib/api";
import {
  formatDateOnly,
  formatINR,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  VendorCategory,
  VendorSummary,
} from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface VendorList {
  asOf: string;
  totalOutstanding: string;
  totalOverdue: string;
  items: VendorSummary[];
}

function AddVendor({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VendorCategory>("RAW_MATERIAL");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let id = "";
    const ok = await run(async () => {
      const vendor = await apiPost<{ id: string }>("/vendors", {
        name,
        category,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
      });
      id = vendor.id;
    });
    if (ok) router.push(`/vendors/${id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium">New vendor</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name *">
          <input className={inputClass} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Category *">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as VendorCategory)}>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact person">
          <input className={inputClass} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Add vendor
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Vendor outstanding (#14): what we owe each vendor. */
export default function VendorsPage() {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const { data, error } = useApi<VendorList>(can(TAGS.VENDORS_READ) ? "/vendors" : null);
  if (!can(TAGS.VENDORS_READ)) return <NoAccess tag={TAGS.VENDORS_READ} />;

  return (
    <>
      <PageHeader
        title="Vendor outstanding"
        action={
          can(TAGS.VENDORS_WRITE) &&
          !adding && (
            <button className={buttonClass} onClick={() => setAdding(true)}>
              New vendor
            </button>
          )
        }
      />
      {adding && <AddVendor onCancel={() => setAdding(false)} />}
      <ErrorText error={error} />
      {data && (
        <>
          <div className="mb-4 flex gap-8">
            <Stat label="We owe in total" value={formatINR(data.totalOutstanding)} />
            <Stat label="Past due" value={formatINR(data.totalOverdue)} tone={Number(data.totalOverdue) > 0 ? "alert" : undefined} />
          </div>
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Vendor</th>
                  <th className={thClass}>Category</th>
                  <th className={`${thClass} text-right`}>Purchased</th>
                  <th className={`${thClass} text-right`}>Paid</th>
                  <th className={`${thClass} text-right`}>Outstanding</th>
                  <th className={`${thClass} text-right`}>Overdue</th>
                  <th className={thClass}>Oldest unpaid due</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {data.items.map((v) => (
                  <tr key={v.id} className={v.isOverdue ? overdueRowClass : ""}>
                    <td className={tdClass}>
                      <Link href={`/vendors/${v.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                        {v.name}
                      </Link>
                      {v.contactPerson && <div className="text-xs text-neutral-500">{v.contactPerson}</div>}
                    </td>
                    <td className={tdClass}>{VENDOR_CATEGORY_LABELS[v.category]}</td>
                    <td className={`${tdClass} text-right`}>{formatINR(v.totalPurchased)}</td>
                    <td className={`${tdClass} text-right`}>{formatINR(v.totalPaid)}</td>
                    <td className={`${tdClass} text-right font-medium`}>
                      {Number(v.outstanding) > 0 ? formatINR(v.outstanding) : <span className="text-green-700">Settled</span>}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {v.isOverdue ? (
                        <span className="font-semibold text-red-700 dark:text-red-300">{formatINR(v.overdue)}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={tdClass}>
                      {v.oldestUnpaidDue ? formatDateOnly(v.oldestUnpaidDue) : "-"}
                      {v.isOverdue && (
                        <div>
                          <OverdueTag />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
