import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Signed-in pages check the login token in the browser before rendering, so they
// can't be prerendered as an instant shell. Opt out of instant-navigation checks
// until sessions move to httpOnly cookies read on the server.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
