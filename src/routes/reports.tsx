import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgingReport, getInvoiceUsageReport, getRevenueReport, getTaxReport } from "@/lib/billing/api";
import { exportToCsv, formatMonthLabel, formatVnd } from "@/lib/billing/format";

export const Route = createFileRoute("/reports")({
  loader: async () => {
    const [aging, revenue, tax, usage] = await Promise.all([
      getAgingReport(),
      getRevenueReport(),
      getTaxReport(),
      getInvoiceUsageReport(),
    ]);
    return { aging, revenue, tax, usage };
  },
  component: ReportsPage,
});

function ReportsPage() {
  const { aging, revenue, tax, usage } = Route.useLoaderData();
  const agingTotal = aging.reduce((s, r) => s + r.total, 0);

  function exportAgingCsv() {
    const headers = [
      "Khách hàng",
      "Trong hạn",
      "1–30 ngày",
      "31–60 ngày",
      "61–90 ngày",
      "Trên 90 ngày",
      "Tổng nợ",
    ];
    const rows = aging.map((r) => [
      r.customerName,
      r.current,
      r.d30,
      r.d60,
      r.d90,
      r.d90plus,
      r.total,
    ]);
    exportToCsv(`Bao_cao_tuoi_no_Aging_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  function exportRevenueCsv() {
    const headers = ["Tháng", "Doanh thu phát hành", "Tiền thuế GTGT"];
    const rows = revenue.byMonth.map((m) => [m.month, m.revenue, m.tax]);
    exportToCsv(`Bao_cao_doanh_thu_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  function exportTaxCsv() {
    const headers = ["Thuế suất", "Doanh thu chưa thuế", "Tiền thuế GTGT"];
    const rows = tax.map((t) => [t.name, t.net, t.tax]);
    exportToCsv(`Bang_ke_thue_GTGT_01_1_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  function exportUsageCsv() {
    const headers = [
      "Ký hiệu hóa đơn",
      "Tên loại hóa đơn",
      "Năm",
      "Số hiện tại",
      "Đã sử dụng",
      "Đã hủy",
      "Đã điều chỉnh",
      "Tổng cộng đã dùng",
      "Hạn mức còn lại",
    ];
    const rows = usage.map((u) => [
      u.seriesCode,
      u.seriesName,
      u.year,
      u.currentNumber,
      u.issuedCount,
      u.cancelledCount,
      u.adjustedCount,
      u.totalUsed,
      u.remainingQuota,
    ]);
    exportToCsv(`Bao_cao_su_dung_hoa_don_BC26_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tài chính & Thuế"
        title="Báo cáo tài chính & Kê khai thuế"
        description="Phân tích tuổi nợ, doanh thu, bảng kê thuế GTGT đầu ra (Mẫu 01-1/GTGT) và báo cáo tình hình sử dụng hóa đơn (BC26/HĐ)."
      />

      <Tabs defaultValue="aging">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="aging">Tuổi nợ (Aging)</TabsTrigger>
          <TabsTrigger value="revenue">Doanh thu & Thu tiền</TabsTrigger>
          <TabsTrigger value="tax">Thuế GTGT (01-1/GTGT)</TabsTrigger>
          <TabsTrigger value="usage">Sử dụng HĐ (BC26/HĐ)</TabsTrigger>
        </TabsList>

        {/* TAB 1: AGING */}
        <TabsContent value="aging" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Tổng số dư nợ phải thu:{" "}
              <strong className="text-primary font-semibold">{formatVnd(agingTotal)}</strong>
            </p>
            <Button size="sm" variant="outline" onClick={exportAgingCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead className="text-right">Trong hạn</TableHead>
                  <TableHead className="text-right">1–30 ngày</TableHead>
                  <TableHead className="text-right">31–60 ngày</TableHead>
                  <TableHead className="text-right">61–90 ngày</TableHead>
                  <TableHead className="text-right">Trên 90 ngày</TableHead>
                  <TableHead className="text-right">Tổng nợ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(r.current)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(r.d30)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(r.d60)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(r.d90)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive font-medium">
                      {formatVnd(r.d90plus)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-primary">
                      {formatVnd(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: REVENUE */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportRevenueCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Xuất CSV doanh thu
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Doanh thu và Thu nợ theo 12 tháng</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue.byMonth}>
                  <CartesianGrid stroke="#e0d6c6" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}tr`}
                    tick={{ fontSize: 11 }}
                    width={52}
                  />
                  <Tooltip formatter={(v) => formatVnd(Number(v ?? 0))} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#1a4a52" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tax" name="Tiền thuế GTGT" fill="#067647" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top khách hàng theo doanh số</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {revenue.byCustomer.map((c) => (
                  <div key={c.name} className="flex justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="tabular-nums font-semibold text-primary">{formatVnd(c.revenue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top sản phẩm & dịch vụ bán chạy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {revenue.byProduct.map((p) => (
                  <div key={p.name} className="flex justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="tabular-nums font-semibold text-primary">{formatVnd(p.revenue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: TAX */}
        <TabsContent value="tax" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Bảng kê hàng hóa dịch vụ bán ra phục vụ lập tờ khai thuế GTGT Mẫu 01-1/GTGT.
            </p>
            <Button size="sm" variant="outline" onClick={exportTaxCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Xuất CSV Bảng kê thuế
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thuế suất</TableHead>
                  <TableHead className="text-right">Doanh thu chưa thuế</TableHead>
                  <TableHead className="text-right">Tiền thuế GTGT</TableHead>
                  <TableHead className="text-right">Tổng doanh thu có thuế</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tax.map((t) => (
                  <TableRow key={t.rate}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(t.net)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary font-medium">
                      {formatVnd(t.tax)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {formatVnd(t.net + t.tax)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 4: BC26/HD USAGE */}
        <TabsContent value="usage" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Báo cáo tình hình sử dụng hóa đơn theo mẫu BC26/HĐ quy định của cơ quan Thuế.
            </p>
            <Button size="sm" variant="outline" onClick={exportUsageCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Xuất CSV BC26/HĐ
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ký hiệu HĐ</TableHead>
                  <TableHead>Tên loại hóa đơn</TableHead>
                  <TableHead>Năm</TableHead>
                  <TableHead className="text-right">Số hiện tại</TableHead>
                  <TableHead className="text-right">Đã sử dụng</TableHead>
                  <TableHead className="text-right">Đã hủy</TableHead>
                  <TableHead className="text-right">Đã điều chỉnh</TableHead>
                  <TableHead className="text-right font-bold">Tổng cộng dùng</TableHead>
                  <TableHead className="text-right">Tồn còn lại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => (
                  <TableRow key={u.seriesId}>
                    <TableCell className="font-mono font-semibold text-primary">
                      {u.seriesCode}
                    </TableCell>
                    <TableCell>{u.seriesName}</TableCell>
                    <TableCell>{u.year}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.currentNumber}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 font-medium">
                      {u.issuedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {u.cancelledCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">
                      {u.adjustedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {u.totalUsed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {u.remainingQuota}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
