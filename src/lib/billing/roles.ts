import type { Role } from "./types";

export type Action =
  | "invoice.create"
  | "invoice.edit"
  | "invoice.submit"
  | "invoice.issue"
  | "invoice.cancel"
  | "invoice.adjust"
  | "invoice.delete"
  | "payment.record"
  | "payment.allocate"
  | "payment.reverse"
  | "customer.write"
  | "product.write"
  | "reminder.run"
  | "settings.write"
  | "audit.view";

const ALL: Role[] = ["admin", "chief", "accountant", "viewer"];
const WRITE: Role[] = ["admin", "chief", "accountant"];
const APPROVE: Role[] = ["admin", "chief"];
const ADMIN: Role[] = ["admin"];

const MATRIX: Record<Action, Role[]> = {
  "invoice.create": WRITE,
  "invoice.edit": WRITE,
  "invoice.submit": WRITE,
  "invoice.issue": APPROVE,
  "invoice.cancel": APPROVE,
  "invoice.adjust": APPROVE,
  "invoice.delete": ADMIN,
  "payment.record": WRITE,
  "payment.allocate": WRITE,
  "payment.reverse": APPROVE,
  "customer.write": WRITE,
  "product.write": WRITE,
  "reminder.run": APPROVE,
  "settings.write": ADMIN,
  "audit.view": ALL,
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new Error("Bạn không có quyền thực hiện thao tác này.");
  }
}

export const ROLE_STAFF_ID: Record<Role, number> = {
  admin: 1,
  chief: 2,
  accountant: 3,
  viewer: 4,
};

export const DEFAULT_ROLE: Role = "chief";
