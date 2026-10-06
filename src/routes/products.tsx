import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PackagePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/layout/role-context";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLookups, listProducts, saveProduct } from "@/lib/billing/api";
import { errMsg } from "@/lib/billing/client";
import { formatVnd } from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";
import type { Product } from "@/lib/billing/types";

export const Route = createFileRoute("/products")({
  loader: async () => {
    const [products, lookups] = await Promise.all([listProducts({ data: {} }), getLookups()]);
    return { products, taxRates: lookups.taxRates };
  },
  component: ProductsPage,
});

function ProductsPage() {
  const { products, taxRates } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  return (
    <div>
      <PageHeader
        eyebrow="Danh mục"
        title="Sản phẩm & dịch vụ"
        description="Đơn giá, đơn vị tính và thuế suất mặc định khi lập hóa đơn."
        actions={
          can(role, "product.write") ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <PackagePlus className="h-4 w-4" />
              Thêm sản phẩm
            </Button>
          ) : null
        }
      />
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Nhóm</TableHead>
              <TableHead>ĐVT</TableHead>
              <TableHead>Thuế</TableHead>
              <TableHead className="text-right">Đơn giá</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.category}</TableCell>
                <TableCell>{p.unit}</TableCell>
                <TableCell>{p.taxRate}%</TableCell>
                <TableCell className="text-right tabular-nums">{formatVnd(p.unitPrice)}</TableCell>
                <TableCell className="text-right">
                  {can(role, "product.write") ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ProductDialog
        open={open}
        product={editing}
        taxRates={taxRates}
        onOpenChange={setOpen}
        onSaved={async () => {
          setOpen(false);
          await router.invalidate();
        }}
      />
    </div>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  taxRates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  taxRates: { id: number; name: string; rate: number }[];
  onSaved: () => Promise<void>;
}) {
  const { role } = useRole();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: product?.code ?? "",
    name: product?.name ?? "",
    unit: product?.unit ?? "lần",
    unitPrice: product ? String(product.unitPrice) : "",
    taxRateId: String(product?.taxRateId ?? taxRates[0]?.id ?? 1),
    category: product?.category ?? "Dịch vụ",
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setForm({
            code: product?.code ?? "",
            name: product?.name ?? "",
            unit: product?.unit ?? "lần",
            unitPrice: product ? String(product.unitPrice) : "",
            taxRateId: String(product?.taxRateId ?? taxRates[0]?.id ?? 1),
            category: product?.category ?? "Dịch vụ",
          });
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Sửa sản phẩm" : "Thêm sản phẩm"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await saveProduct({
                data: {
                  actorRole: role,
                  id: product?.id,
                  code: form.code,
                  name: form.name,
                  unit: form.unit,
                  unitPrice: Number(form.unitPrice),
                  taxRateId: Number(form.taxRateId),
                  category: form.category,
                  isActive: true,
                },
              });
              toast.success("Đã lưu sản phẩm");
              await onSaved();
            } catch (err) {
              toast.error(errMsg(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Mã</Label>
              <Input className="mt-1.5" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </div>
            <div>
              <Label>Nhóm</Label>
              <Input className="mt-1.5" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Tên</Label>
            <Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>ĐVT</Label>
              <Input className="mt-1.5" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <Label>Đơn giá</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Thuế</Label>
              <Select value={form.taxRateId} onValueChange={(v) => setForm({ ...form, taxRateId: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taxRates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
