import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Bell,
  Copy,
  DollarSign,
  Download,
  FileOutput,
  FileX2,
  Printer,
  QrCode,
  RotateCcw,
  Send,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/layout/role-context";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adjustInvoice,
  cancelInvoice,
  deleteInvoice,
  duplicateInvoice,
  getInvoice,
  getInvoiceXml,
  getLookups,
  getSettings,
  issueInvoice,
  quickPayInvoice,
  rejectInvoice,
  replaceInvoice,
  sendInvoiceReminder,
  submitInvoice,
} from "@/lib/billing/api";
import { downloadText, errMsg, invoiceCode } from "@/lib/billing/client";
import {
  docTienBangChu,
  formatDate,
  formatDateTime,
  formatVnd,
  getVietQrUrl,
  STATUS_LABEL,
} from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";
import type { InvoiceStatus } from "@/lib/billing/types";

export const Route = createFileRoute("/invoices/$id")({
  loader: async ({ params }) => {
    const [invoice, lookups, settings] = await Promise.all([
      getInvoice({ data: { id: Number(params.id) } }),
      getLookups(),
      getSettings(),
    ]);
    return { invoice, methods: lookups.methods, company: settings.company };
  },
  component: InvoiceDetailPage,
});

const FLOW: InvoiceStatus[] = ["draft", "pending", "issued", "paid"];

function InvoiceDetailPage() {
  const { invoice, methods, company } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  // Quick payment form state
  const remaining = Math.max(0, invoice.totalAmount - invoice.paidAmount);
  const [payAmount, setPayAmount] = useState(remaining);
  const [payMethodId, setPayMethodId] = useState(methods[0]?.id ?? 1);
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [reminderNote, setReminderNote] = useState("");

  const code = invoiceCode(invoice.seriesCode, invoice.invoiceNumber);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await router.invalidate();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const qrUrl = getVietQrUrl({
    bankName: company?.bankName || "Vietcombank",
    bankAccount: company?.bankAccount || "0388829999",
    amount: remaining > 0 ? remaining : invoice.totalAmount,
    memo: `TT HD ${code}`,
    accountName: company?.name || "VinaBill",
  });

  return (
    <div>
      <PageHeader
        eyebrow="Chi tiết hóa đơn"
        title={code}
        description={invoice.customerName}
        actions={
          <div className="flex flex-wrap gap-2">
            {invoice.status === "draft" && can(role, "invoice.edit") ? (
              <Button variant="outline" asChild>
                <Link to="/invoices/$id/edit" params={{ id: String(invoice.id) }}>
                  Sửa
                </Link>
              </Button>
            ) : null}
            {invoice.status === "pending" && can(role, "invoice.edit") ? (
              <Button variant="outline" asChild>
                <Link to="/invoices/$id/edit" params={{ id: String(invoice.id) }}>
                  Sửa
                </Link>
              </Button>
            ) : null}
            {invoice.status === "draft" && can(role, "invoice.submit") ? (
              <Button
                disabled={busy}
                onClick={() =>
                  run("Đã gửi duyệt", () =>
                    submitInvoice({ data: { id: invoice.id, actorRole: role } }),
                  )
                }
              >
                <Send className="mr-1.5 h-4 w-4" />
                Gửi duyệt
              </Button>
            ) : null}
            {invoice.status === "pending" && can(role, "invoice.issue") ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
                  Từ chối
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run("Đã phát hành", () =>
                      issueInvoice({ data: { id: invoice.id, actorRole: role } }),
                    )
                  }
                >
                  Phát hành
                </Button>
              </>
            ) : null}
            {remaining > 0 &&
            ["issued", "partial", "overdue"].includes(invoice.status) &&
            can(role, "payment.record") ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setPayAmount(remaining);
                  setPayOpen(true);
                }}
              >
                <Wallet className="mr-1.5 h-4 w-4" />
                Thu tiền ngay
              </Button>
            ) : null}
            {["issued", "partial", "overdue"].includes(invoice.status) && can(role, "reminder.run") ? (
              <Button variant="outline" onClick={() => setReminderOpen(true)}>
                <Bell className="mr-1.5 h-4 w-4" />
                Nhắc nợ
              </Button>
            ) : null}
            {can(role, "invoice.create") ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run("Đã sao chép", async () => {
                    const res = await duplicateInvoice({
                      data: { id: invoice.id, actorRole: role },
                    });
                    await router.navigate({
                      to: "/invoices/$id",
                      params: { id: String(res.id) },
                    });
                  })
                }
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Sao chép
              </Button>
            ) : null}
            {invoice.status === "draft" && can(role, "invoice.delete") ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Xóa nháp
              </Button>
            ) : null}
          </div>
        }
      />

      <ol className="mb-6 flex flex-wrap gap-2">
        {FLOW.map((st, i) => {
          const reached =
            FLOW.indexOf(
              invoice.status === "partial" || invoice.status === "overdue"
                ? "issued"
                : invoice.status === "adjusted" || invoice.status === "cancelled"
                  ? "issued"
                  : invoice.status,
            ) >= i;
          return (
            <li
              key={st}
              className={`rounded-full px-3 py-1 text-xs font-medium ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {i + 1}. {STATUS_LABEL[st]}
            </li>
          );
        })}
        {invoice.status === "overdue" ||
        invoice.status === "partial" ||
        invoice.status === "cancelled" ||
        invoice.status === "adjusted" ? (
          <li>
            <InvoiceStatusBadge status={invoice.status} />
          </li>
        ) : null}
      </ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Khách hàng" value={invoice.customerName} />
            <Field label="MST" value={invoice.customerTaxCode ?? "—"} />
            <Field label="Địa chỉ" value={invoice.customerAddress ?? "—"} />
            <Field label="Email" value={invoice.customerEmail ?? "—"} />
            <Field label="Ngày phát hành" value={formatDate(invoice.issueDate)} />
            <Field label="Hạn thanh toán" value={formatDate(invoice.dueDate)} />
            <Field label="Mã CQT" value={invoice.eInvoiceId ?? "—"} />
            <Field label="Người lập" value={invoice.createdByName} />
            {invoice.adjustedFromId ? (
              <Field
                label="Liên kết hóa đơn gốc"
                value={`Hóa đơn gốc #${invoice.adjustedFromId}`}
              />
            ) : null}
            {invoice.cancelReason ? (
              <Field label="Lý do hủy / thay thế" value={invoice.cancelReason} />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Thanh toán & Công nợ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tổng cộng</span>
              <span className="tabular-nums font-medium">{formatVnd(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đã thu</span>
              <span className="tabular-nums text-emerald-600 font-medium">
                {formatVnd(invoice.paidAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-medium">
              <span>Còn lại</span>
              <span className="font-display text-xl tabular-nums text-primary">
                {formatVnd(remaining)}
              </span>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 text-xs">
              <span className="text-muted-foreground">Bằng chữ: </span>
              <span className="italic font-medium">{docTienBangChu(invoice.totalAmount)}</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="outline" size="sm" asChild>
                <Link to="/invoices/$id/print" params={{ id: String(invoice.id) }}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  In / PDF
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { xml } = await getInvoiceXml({ data: { id: invoice.id } });
                    downloadText(`${code}.xml`, xml, "application/xml");
                  } catch (e) {
                    toast.error(errMsg(e));
                  }
                }}
              >
                <Download className="mr-1.5 h-4 w-4" />
                XML TT78
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQr((prev) => !prev)}
              >
                <QrCode className="mr-1.5 h-4 w-4" />
                VietQR
              </Button>
            </div>

            {showQr ? (
              <div className="mt-3 flex flex-col items-center rounded-lg border border-border p-3 text-center">
                <img
                  src={qrUrl}
                  alt="VietQR"
                  className="h-32 w-32 rounded border border-border object-contain"
                />
                <p className="mt-2 text-xs font-medium">Quét mã thanh toán qua ngân hàng</p>
                <p className="text-[11px] text-muted-foreground">
                  {company?.bankName} · {company?.bankAccount}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lines" className="mt-6">
        <TabsList>
          <TabsTrigger value="lines">Dòng hàng ({invoice.items.length})</TabsTrigger>
          <TabsTrigger value="payments">Thanh toán ({invoice.allocations.length})</TabsTrigger>
          <TabsTrigger value="history">Lịch sử ({invoice.history.length})</TabsTrigger>
          <TabsTrigger value="reminders">Nhắc nợ ({invoice.reminders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="lines">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Mô tả</th>
                  <th className="px-3 py-3">SL</th>
                  <th className="px-3 py-3">Đơn giá</th>
                  <th className="px-3 py-3">CK</th>
                  <th className="px-3 py-3">Thuế</th>
                  <th className="px-4 py-3 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{it.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.productCode ?? "Nhập tay"}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{it.quantity}</td>
                    <td className="px-3 py-3 tabular-nums">{formatVnd(it.unitPrice)}</td>
                    <td className="px-3 py-3 tabular-nums">{it.discountPercent}%</td>
                    <td className="px-3 py-3 tabular-nums">{it.taxRate}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatVnd(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">
                    Cộng tiền hàng
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatVnd(invoice.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">
                    Thuế GTGT
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatVnd(invoice.taxAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right font-medium">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3 text-right font-display text-lg tabular-nums">
                    {formatVnd(invoice.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="payments">
          {invoice.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có khoản thanh toán phân bổ.</p>
          ) : (
            <ul className="divide-y rounded-xl border border-border bg-card">
              {invoice.allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{a.methodName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.paymentDate)} {a.reference ? `· ${a.reference}` : ""}
                    </p>
                  </div>
                  <span className="tabular-nums font-medium text-emerald-600">
                    +{formatVnd(a.allocatedAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="history">
          <ol className="space-y-3">
            {invoice.history.map((h) => (
              <li key={h.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="font-medium">
                  {h.fromStatus ? `${STATUS_LABEL[h.fromStatus as InvoiceStatus] ?? h.fromStatus} → ` : ""}
                  {STATUS_LABEL[h.toStatus as InvoiceStatus] ?? h.toStatus}
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.actorName} · {formatDateTime(h.createdAt)}
                  {h.note ? ` · ${h.note}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="reminders">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                <Bell className="mr-1.5 h-4 w-4" />
                Gửi nhắc nợ ngay
              </Button>
            </div>
            {invoice.reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa gửi nhắc nợ nào cho hóa đơn này.</p>
            ) : (
              <ul className="space-y-2">
                {invoice.reminders.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                    <p className="font-medium">
                      {r.reminderType} · {r.status} · {formatDateTime(r.sentAt ?? r.createdAt)}
                    </p>
                    <p className="text-muted-foreground mt-1">{r.contentSnapshot}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex flex-wrap gap-2">
        {can(role, "invoice.adjust") &&
        ["issued", "partial", "paid", "overdue"].includes(invoice.status) ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run("Đã tạo hóa đơn điều chỉnh", async () => {
                  const res = await adjustInvoice({ data: { id: invoice.id, actorRole: role } });
                  await router.navigate({ to: "/invoices/$id", params: { id: String(res.id) } });
                })
              }
            >
              <FileOutput className="mr-1.5 h-4 w-4" />
              Tạo điều chỉnh
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReplaceOpen(true)}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Lập hóa đơn thay thế
            </Button>
          </>
        ) : null}
        {can(role, "invoice.cancel") &&
        !["cancelled", "adjusted", "paid"].includes(invoice.status) ? (
          <Button variant="destructive" disabled={busy} onClick={() => setCancelOpen(true)}>
            <XCircle className="mr-1.5 h-4 w-4" />
            Hủy hóa đơn
          </Button>
        ) : null}
      </div>

      {/* Dialog Thu tiền ngay */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi nhận thu tiền cho {code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Số tiền thu (VND)</Label>
              <Input
                type="number"
                min={1000}
                max={remaining}
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Số nợ còn lại: {formatVnd(remaining)} ({docTienBangChu(payAmount)})
              </p>
            </div>
            <div>
              <Label>Phương thức thanh toán</Label>
              <Select
                value={String(payMethodId)}
                onValueChange={(v) => setPayMethodId(Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Chọn phương thức" />
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
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Textarea
                placeholder="Ghi chú thu tiền..."
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={busy || payAmount <= 0}
              onClick={() => {
                setPayOpen(false);
                run("Đã ghi nhận thanh toán", () =>
                  quickPayInvoice({
                    data: {
                      invoiceId: invoice.id,
                      amount: payAmount,
                      methodId: payMethodId,
                      reference: payRef.trim() || undefined,
                      notes: payNotes.trim() || undefined,
                      actorRole: role,
                    },
                  }),
                );
              }}
            >
              Xác nhận thu tiền
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Lập hóa đơn thay thế */}
      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lập hóa đơn thay thế cho {code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Theo Nghị định 123, hóa đơn hiện tại sẽ được đánh dấu hủy và hệ thống sẽ tạo một hóa
              đơn nháp mới để quý vị điều chỉnh các sai sót.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do thay thế (VD: Sai sót mã số thuế người mua, sai đơn giá...)"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setReplaceOpen(false);
                run("Đã tạo hóa đơn thay thế", async () => {
                  const res = await replaceInvoice({
                    data: { id: invoice.id, actorRole: role, reason: reason.trim() },
                  });
                  await router.navigate({ to: "/invoices/$id", params: { id: String(res.id) } });
                });
              }}
            >
              Tạo hóa đơn thay thế
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Xóa hóa đơn nháp */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa vĩnh viễn hóa đơn nháp này?</AlertDialogTitle>
            <AlertDialogDescription>
              Thao tác này sẽ xóa hoàn toàn hóa đơn nháp khỏi hệ thống và không thể phục hồi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => {
                e.preventDefault();
                setDeleteOpen(false);
                run("Đã xóa hóa đơn nháp", async () => {
                  await deleteInvoice({ data: { id: invoice.id, actorRole: role } });
                  await router.navigate({ to: "/invoices" });
                });
              }}
            >
              Xóa hóa đơn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Gửi nhắc nợ */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gửi email nhắc nợ cho {invoice.customerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">
              Gửi thông báo nhắc nợ hóa đơn {code} với số dư nợ còn lại là{" "}
              <strong>{formatVnd(remaining)}</strong> đến email{" "}
              <strong>{invoice.customerEmail ?? "của khách hàng"}</strong>.
            </p>
            <div>
              <Label>Lời nhắn thêm (tùy chọn)</Label>
              <Textarea
                placeholder="VD: Đề nghị Quý công ty thanh toán trước ngày..."
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                setReminderOpen(false);
                run("Đã gửi nhắc nợ thành công", () =>
                  sendInvoiceReminder({
                    data: {
                      invoiceId: invoice.id,
                      actorRole: role,
                      note: reminderNote.trim() || undefined,
                    },
                  }),
                );
              }}
            >
              Gửi nhắc nợ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Hủy hóa đơn */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy hóa đơn {code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Cần ghi rõ lý do hủy theo quy định hóa đơn điện tử.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do hủy"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (reason.trim().length < 3) {
                  toast.error("Nhập lý do hủy");
                  return;
                }
                setCancelOpen(false);
                run("Đã hủy hóa đơn", () =>
                  cancelInvoice({
                    data: { id: invoice.id, actorRole: role, reason: reason.trim() },
                  }),
                );
              }}
            >
              Xác nhận hủy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Từ chối duyệt */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Từ chối duyệt?</AlertDialogTitle>
            <AlertDialogDescription>
              Hóa đơn sẽ trở về trạng thái nháp để kế toán chỉnh sửa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do từ chối"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setRejectOpen(false);
                run("Đã từ chối", () =>
                  rejectInvoice({
                    data: { id: invoice.id, actorRole: role, reason: reason || "Không đạt" },
                  }),
                );
              }}
            >
              Từ chối
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
