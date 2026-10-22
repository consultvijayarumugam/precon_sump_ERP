"use client";

import { useAuth } from "@/components/auth-provider";
import { AdminDashboard } from "@/components/dashboards/admin-dashboard";
import { GeneralDashboard } from "@/components/dashboards/general-dashboard";
import { SalesDashboard } from "@/components/dashboards/sales-dashboard";
import { SupervisorDashboard } from "@/components/dashboards/supervisor-dashboard";
import { TelecallerDashboard } from "@/components/dashboards/telecaller-dashboard";

/**
 * Landing page: a dashboard designed for the user's role. Each dashboard only
 * asks for data its tags allow (and checks them again), so a user whose tags
 * differ from their role's preset just sees fewer or more cards, never errors.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  switch (user.role.key) {
    case "admin":
      return <AdminDashboard />;
    case "sales":
      return <SalesDashboard />;
    case "telecaller":
      return <TelecallerDashboard />;
    case "factory_supervisor":
      return <SupervisorDashboard />;
    default:
      return <GeneralDashboard />;
  }
}
