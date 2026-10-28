"use client";

import { useAuth } from "@/components/auth-provider";
import { GeneralDashboard } from "@/components/dashboards/general-dashboard";
import { MasterDashboard } from "@/components/dashboards/master-dashboard";
import { SalesDashboard } from "@/components/dashboards/sales-dashboard";
import { SupervisorDashboard } from "@/components/dashboards/supervisor-dashboard";
import { TelecallerDashboard } from "@/components/dashboards/telecaller-dashboard";

/**
 * Landing page: a dashboard designed for the user's role. Each dashboard only
 * asks for data its tags allow (and checks them again), so a user whose tags
 * differ from their role's preset just sees fewer or more cards, never errors.
 */
function OperationsOffNotice() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="text-xl font-bold tracking-tight">Operations are switched off</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Precon ERP is running as the sales and telecaller CRM. Installations, service and stock will appear here when operations are switched on.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, operations } = useAuth();
  switch (user.role.key) {
    case "admin":
      return <MasterDashboard />;
    case "sales":
      return <SalesDashboard />;
    case "telecaller":
      return <TelecallerDashboard />;
    case "factory_supervisor":
      // Installations, service and stock are operations modules.
      return operations ? <SupervisorDashboard /> : <OperationsOffNotice />;
    default:
      return <GeneralDashboard />;
  }
}
