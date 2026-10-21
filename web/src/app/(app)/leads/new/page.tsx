"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LeadForm } from "@/components/lead-form";
import { NoAccess, PageHeader } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { Lead, TAGS } from "@/lib/crm";

export default function NewLeadPage() {
  const router = useRouter();
  const { can } = useAuth();
  if (!can(TAGS.LEADS_WRITE)) return <NoAccess tag={TAGS.LEADS_WRITE} />;

  return (
    <div className="max-w-2xl">
      <PageHeader title="New lead" />
      {!can(TAGS.LEADS_ASSIGN) && (
        <p className="mb-4 text-sm text-neutral-500">The lead will be assigned to you.</p>
      )}
      <LeadForm
        submitLabel="Create lead"
        onCancel={() => router.back()}
        onSubmit={async (values) => {
          const lead = await apiPost<Lead>("/leads", values);
          router.push(`/leads/${lead.id}`);
        }}
      />
    </div>
  );
}
