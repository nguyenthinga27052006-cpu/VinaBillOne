import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Download, Edit3, Search, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/layout/role-context";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLookups, listCustomers, saveCustomer } from "@/lib/billing/api";
import { errMsg } from "@/lib/billing/client";
import { exportToCsv, formatVnd } from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";
import type { Customer, CustomerType } from "@/lib/billing/types";

export const Route = createFileRoute("/customers")({
  loader: async () => {
    const [customers, lookups] = await Promise.all([listCustomers({ data: {} }), getLookups()]);
    return { customers, groups: lookups.groups };
  },
  component: CustomersPage,
});

function CustomersPage() {
  const { customers, groups } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const filtered = customers.filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.code, c.taxCode, c.email, c.phone].some((x) => x?.toLowerCase().includes(s));
  });

  function onExport() {
    const headers = [
      "Mã khách hàng",
      "Tên khách hàng",
      "Mã số thuế",
      "Loại khách",
      "Địa chỉ",
      "Email",
      "Điện thoại",
      "Hạn TT (ngày)",
      "Công nợ hiện tại",
      "Hạn mức tín dụng",
      "Nhóm khách hàng",
    ];
    const rows = filtered.map((c) => [
      c.code,
      c.name,
      c.taxCode ?? "",
      c.customerType === "enterprise" ? "Doanh nghiệp" : "Cá nhân",
      c.address ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.paymentTermDays,
      c.outstanding,
      c.creditLimit ?? "",
      c.groupName ?? "",
    ]);
    exportToCsv(`Danh_sach_khach_hang_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Danh mục"
        title="Khách hàng & Đối tác"
        description="Doanh nghiệp và cá nhân — hạn mức tín dụng, điều khoản thanh toán, quản lý công nợ."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onExport} disabled={filtered.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất CSV
            </Button>
            {can(role, "customer.write") ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Thêm khách hàng
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên, mã, MST, điện thoại…"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên khách hàng</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Nhóm</TableHead>
              <TableHead className="text-right">Công nợ</TableHead>
              <TableHead className="text-right">Hạn mức</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Không tìm thấy khách hàng nào.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <Link
                      to="/customers/$id"
                      params={{ id: String(c.id) }}
                      className="font-medium hover:underline text-primary"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.taxCode ? `MST: ${c.taxCode} · ` : ""}
                      {c.phone || c.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.customerType === "enterprise" ? "Doanh nghiệp" : "Cá nhân"}
                  </TableCell>
                  <TableCell>{c.groupName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    <span className={c.outstanding > 0 ? "text-amber-600" : "text-muted-foreground"}>
                      {formatVnd(c.outstanding)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.creditLimit != null ? formatVnd(c.creditLimit) : "Không GH"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {can(role, "customer.write") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(c);
                            setOpen(true);
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
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

      <CustomerDialog
        open={open}
        onOpenChange={setOpen}
        customer={editing}
        groups={groups}
        onSaved={async () => {
          setOpen(false);
          await router.invalidate();
        }}
      />
    </div>
  );
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  groups,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  groups: { id: number; name: string }[];
  onSaved: () => Promise<void>;
}) {
  const { role } = useRole();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    taxCode: "",
    address: "",
    email: "",
    phone: "",
    customerType: "enterprise" as CustomerType,
    paymentTermDays: 30,
    creditLimit: "",
    groupId: "",
  });

  function onOpen(v: boolean) {
    if (v) {
      setForm({
        code: customer?.code ?? "",
        name: customer?.name ?? "",
        taxCode: customer?.taxCode ?? "",
        address: customer?.address ?? "",
        email: customer?.email ?? "",
        phone: customer?.phone ?? "",
        customerType: customer?.customerType ?? "enterprise",
        paymentTermDays: customer?.paymentTermDays ?? 30,
        creditLimit: customer?.creditLimit != null ? String(customer.creditLimit) : "",
        groupId: customer?.groupId != null ? String(customer.groupId) : "",
      });
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Sửa khách hàng" : "Thêm khách hàng"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await saveCustomer({
                data: {
                  actorRole: role,
                  id: customer?.id,
                  code: form.code,
                  name: form.name,
                  taxCode: form.taxCode || null,
                  address: form.address || null,
                  email: form.email || null,
                  phone: form.phone || null,
                  customerType: form.customerType,
                  paymentTermDays: Number(form.paymentTermDays),
                  creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
                  groupId: form.groupId ? Number(form.groupId) : null,
                  isActive: true,
                },
              });
              toast.success("Đã lưu thông tin khách hàng");
              await onSaved();
            } catch (err) {
              toast.error(errMsg(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </Field>
            <Field label="Loại">
              <Select
                value={form.customerType}
                onValueChange={(v) =>
                  setForm({ ...form, customerType: v as CustomerType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enterprise">Doanh nghiệp</SelectItem>
                  <SelectItem value="individual">Cá nhân</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Tên khách hàng">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã số thuế">
              <Input
                value={form.taxCode}
                onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
              />
            </Field>
            <Field label="Nhóm khách">
              <Select
                value={form.groupId || "none"}
                onValueChange={(v) => setForm({ ...form, groupId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có nhóm</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Địa chỉ">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Điện thoại">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hạn thanh toán (ngày)">
              <Input
                type="number"
                min={0}
                value={form.paymentTermDays}
                onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Hạn mức tín dụng (VND)">
              <Input
                type="number"
                min={0}
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
