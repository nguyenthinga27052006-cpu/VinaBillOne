import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Clock, FileText, TrendingUp, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard } from "@/lib/billing/api";
import { formatDate, formatMonthLabel, formatVnd, formatVndCompact, STATUS_LABEL } from "@/lib/billing/format";
import { invoiceCode } from "@/lib/billing/client";
import type { InvoiceStatus } from "@/lib/billing/types";

export const Route = createFileRoute("/")({
  loader: () => getDashboard(),
  component: DashboardPage,
});

const STATUS_COLOR: Record<string, string> = {
  draft: "#c4b8a5",
  pending: "#175cd3",
  issued: "#1a4a52",
  partial: "#b54708",
  paid: "#067647",
  overdue: "#b42318",
  adjusted: "#6b6458",
  cancelled: "#a8a29a",
};

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof FileText;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-2xl font-medium tabular-nums tracking-tight md:text-3xl">{value}</p>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: number; title: string; meta: string; amount: number; status: InvoiceStatus }[];
  empty: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link to="/invoices" className="text-xs font-medium text-primary hover:underline">
          Xem tất cả
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul>
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  to="/invoices/$id"
                  params={{ id: String(it.id) }}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="text-xs text-muted-foreground">{it.meta}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">{formatVndCompact(it.amount)}</p>
                    <InvoiceStatusBadge status={it.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const data = Route.useLoaderData();
  const { kpis } = data;

  const statusChart = data.statusBreakdown.map((s) => ({
    name: STATUS_LABEL[s.status],
    status: s.status,
    count: s.count,
    amount: s.amount,
  }));

  const agingLabels: Record<string, string> = {
    current: "Trong hạn",
    "1-30": "1–30 ngày",
    "31-60": "31–60 ngày",
    "61-90": "61–90 ngày",
    "90+": "Trên 90 ngày",
  };

  return (
    <div>
      <PageHeader
        eyebrow="Bảng điều khiển"
        title="Tình hình công nợ hôm nay"
        description="Doanh thu, hóa đơn quá hạn và dòng tiền thu — số liệu realtime từ sổ cái."
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              Tạo hóa đơn
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Doanh thu tháng này"
          value={formatVndCompact(kpis.revenueThisMonth)}
          hint={`${kpis.invoicesThisMonth} hóa đơn phát hành`}
          icon={TrendingUp}
        />
        <Kpi
          label="Công nợ phải thu"
          value={formatVndCompact(kpis.outstanding)}
          hint={`Tỷ lệ thu hồi ${kpis.collectionRate.toFixed(0)}%`}
          icon={Wallet}
        />
        <Kpi
          label="Hóa đơn quá hạn"
          value={String(kpis.overdueCount)}
          hint={formatVnd(kpis.overdueAmount)}
          icon={AlertTriangle}
        />
        <Kpi
          label="Chờ xử lý"
          value={`${kpis.pendingCount + kpis.draftCount}`}
          hint={`${kpis.pendingCount} chờ duyệt · ${kpis.draftCount} nháp`}
          icon={Clock}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Doanh thu 12 tháng</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a4a52" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1a4a52" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e0d6c6" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11, fill: "#6b6458" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatVndCompact(Number(v))}
                  tick={{ fontSize: 11, fill: "#6b6458" }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <RechartsTooltip
                  formatter={(v) => formatVnd(Number(v ?? 0))}
                  labelFormatter={(l) => formatMonthLabel(String(l))}
                />
                <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#1a4a52" fill="url(#rev)" strokeWidth={2} />
                <Area type="monotone" dataKey="collected" name="Đã thu" stroke="#067647" fill="none" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Cơ cấu trạng thái</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChart} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid stroke="#e0d6c6" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "#6b6458" }} axisLine={false} tickLine={false} />
                <RechartsTooltip formatter={(v) => `${v} HĐ`} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
                  {statusChart.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLOR[s.status] ?? "#1a4a52"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.aging.map((a) => (
              <div key={a.bucket} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{agingLabels[a.bucket] ?? a.bucket}</span>
                <span className="tabular-nums font-medium">
                  {formatVndCompact(a.amount)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{a.count}</span>
                </span>
              </div>
            ))}
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link to="/reports">Mở báo cáo aging</Link>
            </Button>
          </CardContent>
        </Card>

        <MiniList
          title="Sắp đến hạn"
          empty="Không có hóa đơn đến hạn trong 14 ngày."
          items={data.dueSoon.map((i) => ({
            id: i.id,
            title: i.customerName,
            meta: `${invoiceCode(i.seriesCode, i.invoiceNumber)} · hạn ${formatDate(i.dueDate)}`,
            amount: i.totalAmount - i.paidAmount,
            status: i.status,
          }))}
        />
        <MiniList
          title="Quá hạn"
          empty="Không có hóa đơn quá hạn."
          items={data.overdue.map((i) => ({
            id: i.id,
            title: i.customerName,
            meta: `${invoiceCode(i.seriesCode, i.invoiceNumber)} · hạn ${formatDate(i.dueDate)}`,
            amount: i.totalAmount - i.paidAmount,
            status: i.status,
          }))}
        />
      </div>
    </div>
  );
}
