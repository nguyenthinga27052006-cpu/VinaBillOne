import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, Eye, FileSearch, Printer, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInvoiceXml, lookupInvoice } from "@/lib/billing/api";
import { downloadText, errMsg, invoiceCode } from "@/lib/billing/client";
import { formatDate, formatVnd } from "@/lib/billing/format";
import type { InvoiceListItem } from "@/lib/billing/types";

export const Route = createFileRoute("/lookup")({
  component: LookupPage,
});

function LookupPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvoiceListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!query.trim()) {
      toast.error("Vui lòng nhập số hóa đơn, mã CQT hoặc mã số thuế");
      return;
    }
    setLoading(true);
    try {
      const res = await lookupInvoice({ data: { q: query.trim() } });
      setResults(res);
      if (res.length === 0) {
        toast.info("Không tìm thấy hóa đơn nào phù hợp");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cổng thông tin"
        title="Tra cứu hóa đơn điện tử"
        description="Tra cứu tính hợp pháp và thông tin chi tiết hóa đơn điện tử theo quy định Nghị định 123/2020/NĐ-CP."
      />

      <Card className="max-w-2xl border-primary/20 bg-linear-to-b from-card to-card/60 shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <ShieldCheck className="h-5 w-5" />
            Tra cứu hóa đơn gốc có mã của cơ quan Thuế
          </div>
          <CardTitle className="text-base text-muted-foreground font-normal">
            Nhập số hóa đơn (VD: 0000001), mã CQT, ký hiệu (1C26TAA), hoặc mã số thuế bên mua để kiểm
            tra.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Số HĐ, mã CQT, mã số thuế người mua…"
                className="pl-9 h-11"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-11 px-6">
              <FileSearch className="mr-1.5 h-4 w-4" />
              {loading ? "Đang tra cứu…" : "Tra cứu"}
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Tìm thử gợi ý:</span>
            {["0000001", "1C26TAA", "0108999888", "0316888999"].map((sample) => (
              <button
                key={sample}
                type="button"
                className="rounded bg-muted px-2 py-0.5 font-mono hover:text-foreground"
                onClick={() => {
                  setQuery(sample);
                }}
              >
                {sample}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {results !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">
              Kết quả tra cứu ({results.length} hóa đơn tìm thấy)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {results.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Không có hóa đơn nào khớp với thông tin đã nhập. Vui lòng kiểm tra lại số hóa đơn
                hoặc mã số thuế.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số hóa đơn</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Ngày phát hành</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="font-mono text-xs font-semibold text-primary">
                          {invoiceCode(inv.seriesCode, inv.invoiceNumber)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Ký hiệu: {inv.seriesCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Mã KH: {inv.customerCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDate(inv.issueDate)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatVnd(inv.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/invoices/$id" params={{ id: String(inv.id) }}>
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Xem
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/invoices/$id/print" params={{ id: String(inv.id) }}>
                              <Printer className="mr-1 h-3.5 w-3.5" />
                              In / PDF
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Tải XML TT78"
                            onClick={async () => {
                              try {
                                const { xml } = await getInvoiceXml({ data: { id: inv.id } });
                                downloadText(
                                  `${invoiceCode(inv.seriesCode, inv.invoiceNumber)}.xml`,
                                  xml,
                                  "application/xml",
                                );
                                toast.success("Đã tải XML thành công");
                              } catch (e) {
                                toast.error(errMsg(e));
                              }
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Thông tin pháp lý hỗ trợ */}
      <div className="grid gap-4 sm:grid-cols-3 pt-4">
        <div className="rounded-xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2 text-primary font-semibold mb-1">
            <CheckCircle2 className="h-4 w-4" />
            Nghị định 123/2020/NĐ-CP
          </div>
          <p className="text-muted-foreground">
            Hóa đơn điện tử khởi tạo có mã của cơ quan Thuế có đầy đủ giá trị pháp lý và chứng từ
            khấu trừ thuế.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2 text-primary font-semibold mb-1">
            <CheckCircle2 className="h-4 w-4" />
            Thông tư 78/2021/TT-BTC
          </div>
          <p className="text-muted-foreground">
            Định dạng dữ liệu chuẩn XML chuẩn hóa trao đổi dữ liệu với hệ thống Cục Thuế quốc gia.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2 text-primary font-semibold mb-1">
            <CheckCircle2 className="h-4 w-4" />
            Chữ ký số xác thực
          </div>
          <p className="text-muted-foreground">
            Dữ liệu hóa đơn được niêm phong toàn vẹn, chống sửa đổi và có giá trị thanh quyết toán
            tài chính.
          </p>
        </div>
      </div>
    </div>
  );
}
