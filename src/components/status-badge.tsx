import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/billing/format";
import type { InvoiceStatus, PaymentStatus } from "@/lib/billing/types";
import { PAYMENT_STATUS_LABEL } from "@/lib/billing/format";

const TONE_VARIANT = {
  muted: "muted",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "outline",
} as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={TONE_VARIANT[STATUS_TONE[status]]}>{STATUS_LABEL[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const variant = status === "confirmed" ? "success" : status === "reversed" ? "danger" : "muted";
  return <Badge variant={variant}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}
