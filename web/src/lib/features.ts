// The product switch (OPERATIONS_ENABLED in api/.env, read from GET /config).
// While it's off the live product is the sales + telecaller + admin CRM: the
// operations modules below are hidden from the sidebar and their pages blocked.

/** Page paths of the operations modules (finance, stock, vendors, installations, service, HR). */
export const OPERATIONS_PATHS = [
  "/orders",
  "/finance",
  "/vendors",
  "/stock",
  "/installations",
  "/service",
  "/leave",
  "/holidays",
  "/hr",
  "/allowances",
  "/admin/overview",
];

export const isOperationsPath = (pathname: string) =>
  OPERATIONS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
