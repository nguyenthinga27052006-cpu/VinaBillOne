import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Edit3, FileSpreadsheet, FileText, Plus, Printer, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCustomer, getCustomerStatement, getLookups, getSettings } from "@/lib/billing/api";
import { invoiceCode } from "@/lib/billing/client";
import { docTienBangChu, exportToCsv, formatDate, formatVnd } from "@/lib/billing/format";
import { useRole } from "@/components/layout/role-context";
import { can } from "@/lib/billing/roles";
import { CustomerDialog } from "./customers";
import type { CustomerStatement } from "@/lib/billing/types";

export const Route = createFileRoute("/customers/$id")({
  loader: async ({ params }) => {
    const [custData, lookups, settings] = await Promise.all([
      getCustomer({ data: { id: Number(params.id) } }),
      getLookups(),
      getSettings(),
    ]);
    return {
      customer: custData.customer,
      invoices: custData.invoices,
      payments: custData.payments,
      groups: lookups.groups,
      company: settings.company,
    };
  },
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customer, invoices, payments, groups, company } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");
  const [loadingStmt, setLoadingStmt] = useState(false);

  async function loadStatement(f = stmtFrom, t = stmtTo) {
    setLoadingStmt(true);
    try {
      const res = await getCustomerStatement({
        data: {
          customerId: customer.id,
          fromDate: f || undefined,
          toDate: t || undefined,
        },
      });
      setStatement(res);
      setStatementOpen(true);
    } finally {
      setLoadingStmt(false);
    }
  }

  function exportStatementCsv() {
    if (!statement) return;
    const headers = ["Ngày", "Loại chứng từ", "Số tham chiếu", "Diễn giải", "Phát sinh Nợ (Mua)", "Phát sinh Có (Trả)", "Dư nợ"];
    const rows = statement.transactions.map((t) => [
      t.date,
      t.type === "invoice" ? "Hóa đơn GTGT" : "Phiếu thu tiền",
      t.ref,
      t.description,
      t.debit,
      t.credit,
      t.runningBalance,
    ]);
    exportToCsv(`Doi_soat_cong_no_${customer.code}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow={customer.code}
        title={customer.name}
        description={`${customer.customerType === "enterprise" ? "Doanh nghiệp" : "Cá nhân"} · Hạn thanh toán ${customer.paymentTermDays} ngày`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={loadingStmt}
              onClick={() => loadStatement()}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Đối soát công nợ
            </Button>
            {can(role, "customer.write") ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Edit3 className="mr-1.5 h-4 w-4" />
                Sửa thông tin
              </Button>
            ) : null}
            {can(role, "invoice.create") ? (
              <Button asChild>
                <Link to="/invoices/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Tạo hóa đơn
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Công nợ hiện tại</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-primary">
              {formatVnd(customer.outstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hạn mức tín dụng</p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {customer.creditLimit != null ? formatVnd(customer.creditLimit) : "Không giới hạn"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tổng số hóa đơn</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{customer.invoiceCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin liên hệ & Pháp lý</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex">
              <span className="w-36 text-muted-foreground">Mã số thuế:</span>
              <span className="font-mono font-medium">{customer.taxCode ?? "—"}</span>
            </div>
            <div className="flex">
              <span className="w-36 text-muted-foreground">Địa chỉ:</span>
              <span>{customer.address ?? "—"}</span>
            </div>
            <div className="flex">
              <span className="w-36 text-muted-foreground">Email:</span>
              <span>{customer.email ?? "—"}</span>
            </div>
            <div className="flex">
              <span className="w-36 text-muted-foreground">Điện thoại:</span>
              <span>{customer.phone ?? "—"}</span>
            </div>
            <div className="flex">
              <span className="w-36 text-muted-foreground">Nhóm khách hàng:</span>
              <span>{customer.groupName ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Thanh toán gần đây</CardTitle>
            <Link to="/payments" className="text-xs text-primary hover:underline">
              Xem tất cả
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{formatDate(p.paymentDate)}</p>
                  <PaymentStatusBadge status={p.status} />
                </div>
                <span className="tabular-nums font-semibold text-emerald-600">
                  +{formatVnd(p.amount)}
                </span>
              </div>
            ))}
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có giao dịch thanh toán.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Lịch sử hóa đơn</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link
                  to="/invoices/$id"
                  params={{ id: String(i.id) }}
                  className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-primary">
                      {invoiceCode(i.seriesCode, i.invoiceNumber)}
                    </p>
                    <p className="text-xs text-muted-foreground">Ngày lập: {formatDate(i.issueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold">{formatVnd(i.totalAmount)}</p>
                    <InvoiceStatusBadge status={i.status} />
                  </div>
                </Link>
              </li>
            ))}
            {invoices.length === 0 ? (
              <li className="px-6 py-8 text-center text-sm text-muted-foreground">
                Chưa có hóa đơn nào cho khách hàng này.
              </li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      {/* Edit Customer Dialog */}
      <CustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        groups={groups}
        onSaved={async () => {
          setEditOpen(false);
          await router.invalidate();
        }}
      />

      {/* Customer Statement Dialog */}
      {statement && (
        <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:p-0 print:border-0 print:shadow-none">
            <DialogHeader className="no-print">
              <DialogTitle>Bảng đối chiếu & Sổ chi tiết công nợ</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2" id="statement-print-area">
              <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                  <p className="font-semibold text-sm uppercase">{company?.name}</p>
                  <p className="text-xs text-muted-foreground">MST: {company?.taxCode}</p>
                  <p className="text-xs text-muted-foreground">{company?.address}</p>
                </div>
                <div className="text-right">
                  <h3 className="font-display text-lg font-bold uppercase text-primary">
                    BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Khách hàng: <strong>{customer.name}</strong> ({customer.code})
                  </p>
                  {customer.taxCode && (
                    <p className="text-xs text-muted-foreground">MST: {customer.taxCode}</p>
                  )}
                </div>
              </div>

              {/* Date Filter toolbar in statement */}
              <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span>Từ ngày:</span>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs bg-card"
                    value={stmtFrom}
                    onChange={(e) => setStmtFrom(e.target.value)}
                  />
                  <span>Đến ngày:</span>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs bg-card"
                    value={stmtTo}
                    onChange={(e) => setStmtTo(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => loadStatement(stmtFrom, stmtTo)}
                  >
                    Xem kỳ này
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8" onClick={exportStatementCsv}>
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    Xuất CSV
                  </Button>
                  <Button size="sm" className="h-8" onClick={() => window.print()}>
                    <Printer className="mr-1 h-3.5 w-3.5" />
                    In biên bản
                  </Button>
                </div>
              </div>

              {/* Balances summary */}
              <div className="grid grid-cols-4 gap-3 text-xs text-center border rounded-lg p-3 bg-muted/20">
                <div>
                  <p className="text-muted-foreground">Số dư đầu kỳ</p>
                  <p className="font-semibold text-sm tabular-nums mt-0.5">
                    {formatVnd(statement.openingBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phát sinh Nợ (Mua hàng)</p>
                  <p className="font-semibold text-sm tabular-nums text-primary mt-0.5">
                    +{formatVnd(statement.totalDebit)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phát sinh Có (Thanh toán)</p>
                  <p className="font-semibold text-sm tabular-nums text-emerald-600 mt-0.5">
                    -{formatVnd(statement.totalCredit)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground font-semibold">Số dư cuối kỳ</p>
                  <p className="font-display font-bold text-base tabular-nums text-primary mt-0.5">
                    {formatVnd(statement.closingBalance)}
                  </p>
                </div>
              </div>

              {/* Transactions table */}
              <div className="rounded-lg border overflow-x-auto text-xs">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Ngày</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Số chứng từ</TableHead>
                      <TableHead>Diễn giải</TableHead>
                      <TableHead className="text-right">Phát sinh Nợ</TableHead>
                      <TableHead className="text-right">Phát sinh Có</TableHead>
                      <TableHead className="text-right">Số dư nợ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/10 font-medium">
                      <TableCell colSpan={6} className="italic text-muted-foreground">
                        Số dư nợ đầu kỳ:
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVnd(statement.openingBalance)}
                      </TableCell>
                    </TableRow>
                    {statement.transactions.map((tx) => (
                      <TableRow key={`${tx.type}-${tx.id}`}>
                        <TableCell className="tabular-nums font-mono">{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          <span
                            className={
                              tx.type === "invoice"
                                ? "text-primary font-medium"
                                : "text-emerald-600 font-medium"
                            }
                          >
                            {tx.type === "invoice" ? "Hóa đơn" : "Phiếu thu"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono font-medium">{tx.ref}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{tx.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tx.debit > 0 ? formatVnd(tx.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {tx.credit > 0 ? formatVnd(tx.credit) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatVnd(tx.runningBalance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-bold border-t-2">
                      <TableCell colSpan={4} className="uppercase text-right">
                        Tổng cộng phát sinh & Dư cuối kỳ:
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {formatVnd(statement.totalDebit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">
                        {formatVnd(statement.totalCredit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary font-display text-sm">
                        {formatVnd(statement.closingBalance)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <span className="text-muted-foreground">Số tiền còn nợ bằng chữ: </span>
                <span className="font-semibold italic">
                  {docTienBangChu(statement.closingBalance)}
                </span>
              </div>

              {/* Signatures for formal statement */}
              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <p className="font-bold uppercase">Đại diện Bên Bán</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, đóng dấu, ghi rõ họ tên)</p>
                  <div className="h-20" />
                  <p className="font-semibold">{company?.legalRep}</p>
                </div>
                <div>
                  <p className="font-bold uppercase">Đại diện Bên Mua</p>
                  <p className="text-muted-foreground text-[10px]">(Ký, đóng dấu, ghi rõ họ tên)</p>
                  <div className="h-20" />
                  <p className="font-semibold">{customer.name}</p>
                </div>
              </div>
            </div>

            <DialogFooter className="no-print">
              <Button variant="outline" onClick={() => setStatementOpen(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
