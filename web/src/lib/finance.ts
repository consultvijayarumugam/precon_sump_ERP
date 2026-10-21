// Finance and stock types, labels and formatting, mirroring the API.
// Money arrives as strings ("125000.00"); business dates as "YYYY-MM-DD".
import type { ProductInterest, UserRef } from "./crm";

export const ORDER_STATUSES = ["CONFIRMED", "DELIVERED", "CANCELLED"] as const;
export const PAYMENT_MODES = ["UPI", "BANK_TRANSFER", "CASH", "CHEQUE", "CARD", "OTHER"] as const;
export const VENDOR_CATEGORIES = ["RAW_MATERIAL", "TRANSPORT", "EQUIPMENT", "SERVICES", "OTHER"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CONFIRMED: "Confirmed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  RAW_MATERIAL: "Raw material",
  TRANSPORT: "Transport",
  EQUIPMENT: "Equipment",
  SERVICES: "Services",
  OTHER: "Other",
};

export interface SalesOrder {
  id: string;
  orderNumber: number;
  orderNumberLabel: string;
  customerName: string;
  quantity: number;
  totalAmount: string;
  orderDate: string;
  dueDate: string;
  status: OrderStatus;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  lead: { id: string; phone: string; city: string | null };
  product: { id: string; code: ProductInterest; name: string; unit: string };
  salesperson: UserRef;
  createdBy: UserRef;
  // Present only for users with payments.read:
  amountPaid?: string;
  balanceDue?: string;
  isOverdue?: boolean;
}

export interface CustomerPayment {
  id: string;
  amount: string;
  paidOn: string;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  recordedBy: UserRef;
}

export interface SalesOrderDetail extends SalesOrder {
  payments?: CustomerPayment[];
}

export interface OverdueOrder extends SalesOrder {
  daysOverdue: number;
}

export interface Product {
  id: string;
  code: ProductInterest;
  name: string;
  unit: string;
  quantityOnHand: number;
  lowStockThreshold: number;
  isLow: boolean;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  change: number;
  reason: "OPENING" | "PRODUCTION" | "DELIVERY" | "ADJUSTMENT";
  note: string | null;
  createdAt: string;
  product: { code: ProductInterest; name: string; unit: string };
  salesOrder: { id: string; orderNumber: number } | null;
  createdBy: UserRef;
}

export interface VendorSummary {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  category: VendorCategory;
  notes: string | null;
  totalPurchased: string;
  totalPaid: string;
  outstanding: string;
  overdue: string;
  isOverdue: boolean;
  oldestUnpaidDue: string | null;
}

export interface VendorDetail extends Omit<VendorSummary, "isOverdue" | "oldestUnpaidDue"> {
  purchases: {
    id: string;
    item: string;
    invoiceNumber: string | null;
    amount: string;
    purchaseDate: string;
    dueDate: string;
    notes: string | null;
    unpaid: string;
    isOverdue: boolean;
    daysOverdue: number;
    createdBy: UserRef;
  }[];
  payments: {
    id: string;
    amount: string;
    paidOn: string;
    mode: PaymentMode;
    reference: string | null;
    note: string | null;
    recordedBy: UserRef;
  }[];
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "125000.00" -> "₹1,25,000" */
export const formatINR = (amount: string | number) => inr.format(Number(amount));

const dateOnlyFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10-21" -> "21 Oct 2026" (no time-zone shift). */
export const formatDateOnly = (value: string) => dateOnlyFormat.format(new Date(`${value}T00:00:00Z`));

/** Add days to a "YYYY-MM-DD" date. */
export function addDaysToDate(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
