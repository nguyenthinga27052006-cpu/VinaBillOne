import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FilePlus, Filter, Printer, Search } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listInvoices } from "@/lib/billing/api";
import { invoiceCode } from "@/lib/billing/client";
import { exportToCsv, formatDate, formatVnd, STATUS_LABEL } from "@/lib/billing/format";
import { INVOICE_STATUSES } from "@/lib/billing/types";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/layout/role-context";
import { can } from "@/lib/billing/roles";

const searchSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  q: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const Route = createFileRoute("/invoices")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listInvoices({ data: deps }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const invoices = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { role } = useRole();

  function onExport() {
    const headers = [
      "Số hóa đơn",
      "Ký hiệu",
      "Mã khách hàng",
      "Tên khách hàng",
      "Ngày lập",
      "Hạn thanh toán",
      "Trạng thái",
      "Tiền hàng",
      "Tiền thuế",
      "Tổng thanh toán",
      "Đã thu",
      "Còn lại",
      "Người lập",
    ];
    const rows = invoices.map((inv) => [
      inv.invoiceNumber ?? "",
      inv.seriesCode,
      inv.customerCode,
      inv.customerName,
      inv.issueDate,
      inv.dueDate,
      STATUS_LABEL[inv.status] ?? inv.status,
      inv.subtotal,
      inv.taxAmount,
      inv.totalAmount,
      inv.paidAmount,
      inv.totalAmount - inv.paidAmount,
      inv.createdByName,
    ]);
    exportToCsv(`Danh_sach_hoa_don_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Sổ hóa đơn"
        title="Hóa đơn điện tử"
        description="Toàn bộ vòng đời: nháp, duyệt, phát hành, công nợ và thanh toán."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onExport} disabled={invoices.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất CSV
            </Button>
            {can(role, "invoice.create") ? (
              <Button asChild>
                <Link to="/invoices/new">
                  <FilePlus className="mr-1.5 h-4 w-4" />
                  Tạo hóa đơn
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={!search.status}
              onClick={() => navigate({ search: { ...search, status: undefined } })}
            >
              Tất cả
            </FilterChip>
            {INVOICE_STATUSES.map((st) => (
              <FilterChip
                key={st}
                active={search.status === st}
                onClick={() => navigate({ search: { ...search, status: st } })}
              >
                {STATUS_LABEL[st]}
              </FilterChip>
            ))}
          </div>

          <form
            className="relative w-full sm:w-72"
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q") ?? "");
              navigate({ search: { ...search, q: q || undefined } });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={search.q ?? ""}
              placeholder="Tìm số HĐ, khách hàng…"
              className="pl-9"
            />
          </form>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium">
            <Filter className="h-3.5 w-3.5" /> Lọc theo ngày lập:
          </span>
          <div className="flex items-center gap-1.5">
            <span>Từ:</span>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={search.fromDate ?? ""}
              onChange={(e) =>
                navigate({
                  search: { ...search, fromDate: e.target.value || undefined },
                })
              }
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span>Đến:</span>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={search.toDate ?? ""}
              onChange={(e) =>
                navigate({
                  search: { ...search, toDate: e.target.value || undefined },
                })
              }
            />
          </div>
          {(search.fromDate || search.toDate || search.q || search.status) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ search: {} })}
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={FilePlus}
          title="Không tìm thấy hóa đơn"
          description="Chưa có hóa đơn nào thỏa mãn điều kiện tìm kiếm hoặc chưa tạo hóa đơn."
          action={
            can(role, "invoice.create") ? (
              <Button asChild>
                <Link to="/invoices/new">Tạo hóa đơn</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số HĐ</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead>Ngày lập</TableHead>
                <TableHead>Hạn TT</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead className="text-right">Còn lại</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/invoices/$id"
                      params={{ id: String(inv.id) }}
                      className="font-medium hover:underline text-primary"
                    >
                      {invoiceCode(inv.seriesCode, inv.invoiceNumber)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/customers/$id"
                      params={{ id: String(inv.customerId) }}
                      className="hover:underline font-medium"
                    >
                      {inv.customerName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{inv.customerCode}</div>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">{formatDate(inv.issueDate)}</TableCell>
                  <TableCell className="tabular-nums text-sm">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatVnd(inv.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        inv.totalAmount - inv.paidAmount > 0
                          ? "font-semibold text-amber-600"
                          : "text-muted-foreground"
                      }
                    >
                      {formatVnd(inv.totalAmount - inv.paidAmount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/invoices/$id/print" params={{ id: String(inv.id) }}>
                        <Printer className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
