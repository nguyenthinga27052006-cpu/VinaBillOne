export const ROLES = ["admin", "chief", "accountant", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "pending",
  "issued",
  "partial",
  "paid",
  "overdue",
  "adjusted",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ["draft", "confirmed", "reversed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type CustomerType = "enterprise" | "individual";

export type InvoiceListItem = {
  id: number;
  invoiceNumber: string | null;
  seriesCode: string;
  customerId: number;
  customerName: string;
  customerCode: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  createdByName: string;
};

export type InvoiceLine = {
  id: number;
  productId: number | null;
  productCode: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRateId: number;
  taxRate: number;
  taxName: string;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
};

export type InvoiceDetail = InvoiceListItem & {
  notes: string | null;
  eInvoiceId: string | null;
  createdAt: string;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  adjustedFromId: number | null;
  customerTaxCode: string | null;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerType: CustomerType;
  seriesId: number;
  items: InvoiceLine[];
  history: StatusHistory[];
  allocations: PaymentOnInvoice[];
  reminders: ReminderLog[];
};

export type StatusHistory = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorName: string;
  createdAt: string;
};

export type PaymentOnInvoice = {
  id: number;
  paymentId: number;
  allocatedAmount: number;
  paymentDate: string;
  methodName: string;
  reference: string | null;
  status: PaymentStatus;
};

export type Customer = {
  id: number;
  code: string;
  name: string;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  customerType: CustomerType;
  paymentTermDays: number;
  creditLimit: number | null;
  groupName: string | null;
  groupId: number | null;
  isActive: boolean;
  outstanding: number;
  invoiceCount: number;
};

export type Product = {
  id: number;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  taxRateId: number;
  taxRate: number;
  category: string;
  isActive: boolean;
};

export type TaxRate = {
  id: number;
  name: string;
  rate: number;
  isActive: boolean;
};

export type InvoiceSeries = {
  id: number;
  code: string;
  name: string;
  prefix: string;
  currentNumber: number;
  year: number;
  isActive: boolean;
};

export type PaymentMethod = {
  id: number;
  name: string;
  code: string;
};

export type PaymentListItem = {
  id: number;
  customerId: number;
  customerName: string;
  paymentDate: string;
  amount: number;
  allocated: number;
  remaining: number;
  methodName: string;
  reference: string | null;
  status: PaymentStatus;
  notes: string | null;
  recordedByName: string;
};

export type PaymentDetail = PaymentListItem & {
  methodId: number;
  allocations: {
    invoiceId: number;
    invoiceNumber: string;
    allocatedAmount: number;
    invoiceTotal: number;
    invoicePaid: number;
    invoiceStatus: InvoiceStatus;
  }[];
};

export type ReminderLog = {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  reminderType: string;
  status: string;
  sentAt: string | null;
  contentSnapshot: string | null;
  retryCount: number;
  createdAt: string;
  dueDate: string;
  daysOverdue: number;
};

export type ReminderRule = {
  id: number;
  name: string;
  daysOverdue: number;
  channel: string;
  isActive: boolean;
};

export type AuditLog = {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: number;
  summary: string;
  createdAt: string;
};

export type CompanySettings = {
  name: string;
  taxCode: string;
  address: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  legalRep: string;
};

export type DashboardData = {
  kpis: {
    invoicesThisMonth: number;
    revenueThisMonth: number;
    outstanding: number;
    overdueCount: number;
    overdueAmount: number;
    collectionRate: number;
    draftCount: number;
    pendingCount: number;
  };
  monthlyRevenue: { month: string; revenue: number; collected: number }[];
  statusBreakdown: { status: InvoiceStatus; count: number; amount: number }[];
  aging: { bucket: string; count: number; amount: number }[];
  dueSoon: InvoiceListItem[];
  overdue: InvoiceListItem[];
  recentPayments: PaymentListItem[];
};

export type AgingRow = {
  customerId: number;
  customerName: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  total: number;
};

export type LineInput = {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRateId: number;
};

export type StaffMember = {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export type StatementTransaction = {
  id: number;
  date: string;
  type: "invoice" | "payment";
  ref: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type CustomerStatement = {
  customer: Customer;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  transactions: StatementTransaction[];
};

export type InvoiceUsageReportItem = {
  seriesId: number;
  seriesCode: string;
  seriesName: string;
  year: number;
  currentNumber: number;
  issuedCount: number;
  cancelledCount: number;
  adjustedCount: number;
  totalUsed: number;
  remainingQuota: number;
};

