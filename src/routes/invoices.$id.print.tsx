import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckSquare, Printer, QrCode, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { bootstrapApp, getInvoice } from "@/lib/billing/api";
import { invoiceCode } from "@/lib/billing/client";
import { docTienBangChu, formatDate, formatDateTime, formatVnd, getVietQrUrl } from "@/lib/billing/format";
import { useRole } from "@/components/layout/role-context";
import { ROLE_NAME } from "@/lib/billing/format";

export const Route = createFileRoute("/invoices/$id/print")({
  loader: async ({ params }) => {
    const [invoice, boot] = await Promise.all([
      getInvoice({ data: { id: Number(params.id) } }),
      bootstrapApp(),
    ]);
    return { invoice, company: boot.company };
  },
  component: PrintInvoicePage,
});

function PrintInvoicePage() {
  const { invoice, company } = Route.useLoaderData();
  const { role } = useRole();
  const [isConverted, setIsConverted] = useState(false);
  const [convertedDate] = useState(() => new Date().toISOString());
  const [showQr, setShowQr] = useState(true);

  const code = invoiceCode(invoice.seriesCode, invoice.invoiceNumber);
  const remaining = invoice.totalAmount - invoice.paidAmount;
  const qrUrl = getVietQrUrl({
    bankName: company.bankName,
    bankAccount: company.bankAccount,
    amount: remaining > 0 ? remaining : invoice.totalAmount,
    memo: `TT HD ${code}`,
    accountName: company.name,
  });

  return (
    <div className="min-h-svh bg-background px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
        <Button variant="outline" asChild>
          <Link to="/invoices/$id" params={{ id: String(invoice.id) }}>
            Quay lại
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConverted((prev) => !prev)}
            className="text-xs"
          >
            {isConverted ? (
              <CheckSquare className="mr-1.5 h-4 w-4 text-primary" />
            ) : (
              <Square className="mr-1.5 h-4 w-4 text-muted-foreground" />
            )}
            Chế độ Hóa đơn chuyển đổi (NĐ 123)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQr((prev) => !prev)}
            className="text-xs"
          >
            <QrCode className="mr-1.5 h-4 w-4 text-primary" />
            {showQr ? "Ẩn VietQR" : "Hiện VietQR"}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            In / Lưu PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)] print:border-0 print:p-0 print:shadow-none md:p-12">
        {isConverted ? (
          <div className="mb-6 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 text-center">
            <p className="font-display text-sm font-semibold tracking-wider text-primary uppercase">
              HÓA ĐƠN CHUYỂN ĐỔI TỪ HÓA ĐƠN ĐIỆN TỬ
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Người thực hiện chuyển đổi: <strong>{ROLE_NAME[role]}</strong> · Ngày chuyển đổi:{" "}
              <strong>{formatDateTime(convertedDate)}</strong>
            </p>
            <p className="text-[11px] text-muted-foreground">
              (Chuyển đổi theo quy định tại Điều 7 Nghị định số 123/2020/NĐ-CP của Chính phủ)
            </p>
          </div>
        ) : null}

        <header className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-display text-2xl font-medium tracking-tight">{company.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              MST: <strong className="text-foreground">{company.taxCode}</strong>
              <br />
              Địa chỉ: {company.address}
              <br />
              Điện thoại: {company.phone} · Email: {company.email}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Hóa đơn giá trị gia tăng
            </p>
            <p className="font-mono text-2xl font-bold">{code}</p>
            <p className="text-sm text-muted-foreground">Ký hiệu: <strong>{invoice.seriesCode}</strong></p>
            {invoice.eInvoiceId ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">Mã CQT: {invoice.eInvoiceId}</p>
            ) : null}
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đơn vị bán hàng</p>
            <p className="mt-1.5 font-medium">{company.name}</p>
            <p className="mt-1 text-sm">Tài khoản: <strong>{company.bankAccount}</strong></p>
            <p className="text-sm text-muted-foreground">{company.bankName}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Người mua hàng</p>
            <p className="mt-1.5 font-medium">{invoice.customerName}</p>
            <p className="mt-1 text-sm">MST: <strong>{invoice.customerTaxCode ?? "—"}</strong></p>
            <p className="text-sm text-muted-foreground">{invoice.customerAddress ?? "—"}</p>
          </div>
        </section>

        <div className="mb-4 flex flex-wrap gap-6 text-sm">
          <p>
            Ngày lập: <strong>{formatDate(invoice.issueDate)}</strong>
          </p>
          <p>
            Hạn thanh toán: <strong>{formatDate(invoice.dueDate)}</strong>
          </p>
          <p>
            Đơn vị tiền tệ: <strong>VND</strong>
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2.5 pr-2">#</th>
              <th className="py-2.5">Hàng hóa, dịch vụ</th>
              <th className="py-2.5 text-right">SL</th>
              <th className="py-2.5 text-right">Đơn giá</th>
              <th className="py-2.5 text-right">Thuế</th>
              <th className="py-2.5 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={it.id} className="border-b border-border/70">
                <td className="py-2.5 pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2.5">
                  <div className="font-medium">{it.description}</div>
                  {it.productCode ? (
                    <div className="font-mono text-xs text-muted-foreground">{it.productCode}</div>
                  ) : null}
                </td>
                <td className="py-2.5 text-right tabular-nums">{it.quantity}</td>
                <td className="py-2.5 text-right tabular-nums">{formatVnd(it.unitPrice)}</td>
                <td className="py-2.5 text-right tabular-nums">{it.taxRate}%</td>
                <td className="py-2.5 text-right font-medium tabular-nums">{formatVnd(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex flex-col items-start justify-between gap-6 sm:flex-row">
          {showQr ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-xs">
              <img
                src={qrUrl}
                alt="VietQR Payment"
                className="h-24 w-24 rounded border border-border object-contain"
              />
              <div className="space-y-1">
                <p className="font-medium uppercase tracking-wide text-primary">Quét mã VietQR chuyển khoản</p>
                <p className="text-muted-foreground">{company.bankName}</p>
                <p className="font-mono font-medium">{company.bankAccount}</p>
                <p className="text-[11px] text-muted-foreground">Nội dung: TT HD {code}</p>
              </div>
            </div>
          ) : <div />}

          <div className="w-full max-w-xs space-y-1.5 text-sm sm:ml-auto">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cộng tiền hàng</span>
              <span className="tabular-nums">{formatVnd(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Thuế GTGT</span>
              <span className="tabular-nums">{formatVnd(invoice.taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-medium">
              <span>Tổng cộng thanh toán</span>
              <span className="font-display text-xl tabular-nums text-primary">
                {formatVnd(invoice.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            Số tiền viết bằng chữ:{" "}
            <strong className="font-medium text-foreground italic">
              {docTienBangChu(invoice.totalAmount)}
            </strong>
          </p>
        </div>

        <footer className="mt-12 grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <p className="font-semibold uppercase tracking-wider text-xs">Người mua hàng</p>
            <p className="mt-1 text-xs text-muted-foreground">(Ký, ghi rõ họ tên)</p>
            <div className="h-16" />
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-xs">Người bán hàng</p>
            <p className="mt-1 text-xs text-muted-foreground">(Chữ ký số hợp lệ)</p>
            <div className="h-16 flex items-center justify-center">
              <span className="rounded border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary">
                Đã ký điện tử bởi {company.name}
              </span>
            </div>
            <p className="text-xs font-medium text-foreground">{company.legalRep}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
