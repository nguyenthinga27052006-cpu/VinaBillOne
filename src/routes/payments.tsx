import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Download, Filter, Plus, Printer, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/layout/role-context";
import { PageHeader } from "@/components/page-header";
import { PaymentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getLookups,
  getSettings,
  listCustomers,
  listPayments,
  openInvoicesForCustomer,
  recordPayment,
  reversePayment,
} from "@/lib/billing/api";
import { remainingOf, roundMoney, todayIso } from "@/lib/billing/calc";
import { errMsg, invoiceCode } from "@/lib/billing/client";
import { docTienBangChu, exportToCsv, formatDate, formatVnd, PAYMENT_STATUS_LABEL } from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";
import type { InvoiceListItem, PaymentListItem } from "@/lib/billing/types";

export const Route = createFileRoute("/payments")({
  loader: async () => {
    const [payments, customers, lookups, settings] = await Promise.all([
      listPayments(),
      listCustomers({ data: {} }),
      getLookups(),
      getSettings(),
    ]);
    return { payments, customers, methods: lookups.methods, company: settings.company };
  },
  component: PaymentsPage,
});

function PaymentsPage() {
  const { payments, customers, methods, company } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<PaymentListItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Filters state
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (methodFilter !== "all" && p.methodName !== methodFilter) return false;
      if (fromDate && p.paymentDate < fromDate) return false;
      if (toDate && p.paymentDate > toDate) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const matchCust = p.customerName.toLowerCase().includes(q);
        const matchRef = (p.reference ?? "").toLowerCase().includes(q);
        const matchNotes = (p.notes ?? "").toLowerCase().includes(q);
        if (!matchCust && !matchRef && !matchNotes) return false;
      }
      return true;
    });
  }, [payments, methodFilter, fromDate, toDate, query]);

  function onExport() {
    const headers = [
      "Mã phiếu",
      "Ngày thu",
      "Khách hàng",
      "Phương thức",
      "Tham chiếu",
      "Số tiền",
      "Đã phân bổ",
      "Còn lại",
      "Trạng thái",
      "Người lập",
      "Ghi chú",
    ];
    const rows = filteredPayments.map((p) => [
      `PT-${p.id}`,
      p.paymentDate,
      p.customerName,
      p.methodName,
      p.reference ?? "",
      p.amount,
      p.allocated,
      p.remaining,
      PAYMENT_STATUS_LABEL[p.status] ?? p.status,
      p.recordedByName,
      p.notes ?? "",
    ]);
    exportToCsv(`Danh_sach_thu_tien_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Công nợ & Dòng tiền"
        title="Sổ thu tiền & Thanh toán"
        description="Ghi nhận thu tiền, in phiếu thu, phân bổ vào một hoặc nhiều hóa đơn."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onExport} disabled={filteredPayments.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất CSV
            </Button>
            {can(role, "payment.record") ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Ghi nhận thanh toán
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Phương thức" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả hình thức</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Từ:</span>
              <Input
                type="date"
                className="h-9 w-36 text-xs"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Đến:</span>
              <Input
                type="date"
                className="h-9 w-36 text-xs"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            {(methodFilter !== "all" || fromDate || toDate || query) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setMethodFilter("all");
                  setFromDate("");
                  setToDate("");
                  setQuery("");
                }}
              >
                Xóa lọc
              </Button>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm khách hàng, tham chiếu…"
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày thu</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Hình thức</TableHead>
              <TableHead>Mã tham chiếu</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Số tiền thu</TableHead>
              <TableHead className="text-right">Còn phân bổ</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Không tìm thấy khoản thanh toán nào.
                </TableCell>
              </TableRow>
            ) : (
              filteredPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums font-mono text-xs">
                    {formatDate(p.paymentDate)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/customers/$id"
                      params={{ id: String(p.customerId) }}
                      className="hover:underline font-medium"
                    >
                      {p.customerName}
                    </Link>
                  </TableCell>
                  <TableCell>{p.methodName}</TableCell>
                  <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                    +{formatVnd(p.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs">
                    {p.remaining > 0 ? (
                      <span className="text-amber-600 font-semibold">{formatVnd(p.remaining)}</span>
                    ) : (
                      "0 ₫"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="In Phiếu Thu"
                        onClick={() => setReceiptPayment(p)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {p.status === "confirmed" && can(role, "payment.reverse") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === p.id}
                          title="Đảo ngược thanh toán"
                          onClick={async () => {
                            setBusyId(p.id);
                            try {
                              await reversePayment({ data: { id: p.id, actorRole: role } });
                              toast.success("Đã đảo ngược thanh toán");
                              await router.invalidate();
                            } catch (e) {
                              toast.error(errMsg(e));
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        customers={customers}
        methods={methods}
        onRecorded={async () => {
          setOpen(false);
          await router.invalidate();
        }}
      />

      {/* Printable Phiếu Thu Dialog */}
      {receiptPayment && (
        <Dialog open={Boolean(receiptPayment)} onOpenChange={(o) => !o && setReceiptPayment(null)}>
          <DialogContent className="max-w-2xl print:p-0 print:border-0 print:shadow-none">
            <DialogHeader className="no-print">
              <DialogTitle>Phiếu thu tiền (Mẫu 01-TT)</DialogTitle>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-card p-6 print:border-0 print:p-0" id="receipt-print-area">
              <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                  <p className="font-semibold text-sm uppercase">{company?.name}</p>
                  <p className="text-xs text-muted-foreground">MST: {company?.taxCode}</p>
                  <p className="text-xs text-muted-foreground">{company?.address}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-xs uppercase">Mẫu số: 01 - TT</p>
                  <p className="text-[11px] text-muted-foreground">
                    (Ban hành theo TT 200/2014/TT-BTC)
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold">Số: PT-{receiptPayment.id}</p>
                </div>
              </div>

              <div className="my-6 text-center">
                <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-primary">
                  PHIẾU THU
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Ngày {receiptPayment.paymentDate.split("-")[2]} tháng{" "}
                  {receiptPayment.paymentDate.split("-")[1]} năm{" "}
                  {receiptPayment.paymentDate.split("-")[0]}
                </p>
              </div>

              <div className="space-y-2 text-sm leading-relaxed">
                <div className="flex">
                  <span className="w-48 text-muted-foreground">Họ và tên người nộp tiền:</span>
                  <span className="font-semibold text-foreground">{receiptPayment.customerName}</span>
                </div>
                <div className="flex">
                  <span className="w-48 text-muted-foreground">Hình thức thanh toán:</span>
                  <span>{receiptPayment.methodName}</span>
                </div>
                <div className="flex">
                  <span className="w-48 text-muted-foreground">Mã tham chiếu / Số GD:</span>
                  <span className="font-mono">{receiptPayment.reference || "—"}</span>
                </div>
                <div className="flex">
                  <span className="w-48 text-muted-foreground">Lý do nộp:</span>
                  <span>{receiptPayment.notes || "Thanh toán tiền hàng / hóa đơn"}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="w-48 text-muted-foreground">Số tiền:</span>
                  <span className="font-display text-lg font-bold text-primary tabular-nums">
                    {formatVnd(receiptPayment.amount)}
                  </span>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <span className="text-muted-foreground text-xs">Viết bằng chữ: </span>
                  <span className="italic font-medium text-foreground">
                    {docTienBangChu(receiptPayment.amount)}
                  </span>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-4 gap-4 text-center text-xs">
                <div>
                  <p className="font-semibold uppercase">Giám đốc</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, họ tên)</p>
                  <div className="h-16" />
                  <p className="font-medium">{company?.legalRep}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase">Kế toán trưởng</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, họ tên)</p>
                  <div className="h-16" />
                  <p className="font-medium">Phạm Thu Hà</p>
                </div>
                <div>
                  <p className="font-semibold uppercase">Người nộp tiền</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, họ tên)</p>
                  <div className="h-16" />
                  <p className="font-medium">{receiptPayment.customerName.split(" ").slice(-2).join(" ")}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase">Người lập phiếu</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, họ tên)</p>
                  <div className="h-16" />
                  <p className="font-medium">{receiptPayment.recordedByName}</p>
                </div>
              </div>
            </div>

            <DialogFooter className="no-print">
              <Button variant="outline" onClick={() => setReceiptPayment(null)}>
                Đóng
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                In Phiếu Thu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RecordPaymentDialog({
  open,
  onOpenChange,
  customers,
  methods,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: { id: number; name: string; outstanding: number }[];
  methods: { id: number; name: string }[];
  onRecorded: () => Promise<void>;
}) {
  const { role } = useRole();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? 0);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? 1);
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [openInvoices, setOpenInvoices] = useState<InvoiceListItem[]>([]);
  const [allocations, setAllocations] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  async function loadCustomerInvoices(cid: number) {
    setCustomerId(cid);
    try {
      const invs = await openInvoicesForCustomer({ data: { customerId: cid } });
      setOpenInvoices(invs);
      setAllocations({});
    } catch {
      setOpenInvoices([]);
    }
  }

  function autoAllocate(amt: number) {
    let remaining = amt;
    const next: Record<number, number> = {};
    for (const inv of openInvoices) {
      if (remaining <= 0) break;
      const need = remainingOf(inv.totalAmount, inv.paidAmount);
      const give = roundMoney(Math.min(remaining, need));
      next[inv.id] = give;
      remaining = roundMoney(remaining - give);
    }
    setAllocations(next);
  }

  const allocatedTotal = useMemo(
    () => roundMoney(Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0)),
    [allocations],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ghi nhận thanh toán</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Khách hàng</Label>
            <Select
              value={String(customerId)}
              onValueChange={(v) => loadCustomerInvoices(Number(v))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Chọn khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name} — Nợ: {formatVnd(c.outstanding)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Số tiền thu (VND)</Label>
            <Input
              type="number"
              min={1000}
              className="mt-1"
              value={amount || ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAmount(v);
                autoAllocate(v);
              }}
            />
          </div>
          <div>
            <Label>Ngày thanh toán</Label>
            <Input
              type="date"
              className="mt-1"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Hình thức</Label>
            <Select value={String(methodId)} onValueChange={(v) => setMethodId(Number(v))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mã tham chiếu / Số UNC</Label>
            <Input
              placeholder="VD: FT24098932..."
              className="mt-1"
              value={reference}
              onChange={(e) => setPayRefSafe(e.target.value, setReference)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Ghi chú</Label>
            <Textarea
              placeholder="Ghi chú thanh toán..."
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {openInvoices.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Phân bổ vào hóa đơn chưa trả (FIFO)
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => autoAllocate(amount)}
              >
                Tự động chia
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-border p-2">
              {openInvoices.map((inv) => {
                const need = remainingOf(inv.totalAmount, inv.paidAmount);
                return (
                  <div key={inv.id} className="flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-medium truncate">
                        {invoiceCode(inv.seriesCode, inv.invoiceNumber)}
                      </p>
                      <p className="text-muted-foreground">Còn nợ {formatVnd(need)}</p>
                    </div>
                    <Input
                      type="number"
                      className="h-7 w-28 text-right tabular-nums text-xs"
                      value={allocations[inv.id] ?? 0}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setAllocations((prev) => ({ ...prev, [inv.id]: val }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs font-medium pt-1">
              <span>Đã phân bổ: {formatVnd(allocatedTotal)}</span>
              <span>Còn lại: {formatVnd(Math.max(0, amount - allocatedTotal))}</span>
            </div>
          </div>
        ) : null}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={busy || amount <= 0}
            onClick={async () => {
              if (amount <= 0) {
                toast.error("Nhập số tiền lớn hơn 0");
                return;
              }
              setBusy(true);
              try {
                const allocList = Object.entries(allocations)
                  .map(([invId, val]) => ({ invoiceId: Number(invId), amount: Number(val) }))
                  .filter((a) => a.amount > 0);
                await recordPayment({
                  data: {
                    customerId,
                    paymentDate,
                    amount,
                    methodId,
                    reference: reference.trim() || undefined,
                    notes: notes.trim() || undefined,
                    actorRole: role,
                    allocations: allocList.length > 0 ? allocList : undefined,
                  },
                });
                toast.success("Đã ghi nhận thanh toán");
                await onRecorded();
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Lưu thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function setPayRefSafe(v: string, setFn: (val: string) => void) {
  setFn(v);
}
