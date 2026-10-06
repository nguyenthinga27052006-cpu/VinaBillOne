import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveInvoice } from "@/lib/billing/api";
import { addDays, computeInvoiceTotals, computeLine, todayIso } from "@/lib/billing/calc";
import { errMsg } from "@/lib/billing/client";
import { formatVnd } from "@/lib/billing/format";
import type { Customer, InvoiceDetail, InvoiceSeries, Product, Role, TaxRate } from "@/lib/billing/types";
import { useRole } from "@/components/layout/role-context";

type DraftLine = {
  key: string;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRateId: number;
};

function newLine(taxRateId: number): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    productId: null,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    taxRateId,
  };
}

export function InvoiceForm({
  invoice,
  customers,
  products,
  taxRates,
  series,
}: {
  invoice?: InvoiceDetail;
  customers: Customer[];
  products: Product[];
  taxRates: TaxRate[];
  series: InvoiceSeries[];
}) {
  const { role } = useRole();
  const navigate = useNavigate();
  const defaultTax = taxRates.find((t) => t.rate === 10)?.id ?? taxRates[0]?.id ?? 1;
  const activeSeries = series.filter((s) => s.isActive);
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? customers[0]?.id ?? 0);
  const [seriesId, setSeriesId] = useState(invoice?.seriesId ?? activeSeries[0]?.id ?? series[0]?.id ?? 1);
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? todayIso());
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? addDays(todayIso(), 30));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    invoice?.items.length
      ? invoice.items.map((it) => ({
          key: String(it.id),
          productId: it.productId,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent,
          taxRateId: it.taxRateId,
        }))
      : [newLine(defaultTax)],
  );
  const [saving, setSaving] = useState(false);

  const customer = customers.find((c) => c.id === customerId);
  const taxMap = useMemo(() => new Map(taxRates.map((t) => [t.id, t.rate])), [taxRates]);

  const computed = lines.map((l) => ({
    ...l,
    ...computeLine({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      taxRate: taxMap.get(l.taxRateId) ?? 0,
    }),
  }));
  const totals = computeInvoiceTotals(computed);
  const projectedDebt = (customer?.outstanding ?? 0) + totals.totalAmount - (invoice?.totalAmount ?? 0);
  const overLimit = customer?.creditLimit != null && projectedDebt > customer.creditLimit;

  function applyProduct(key: string, productId: number) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              productId: p.id,
              description: p.name,
              unitPrice: p.unitPrice,
              taxRateId: p.taxRateId,
            }
          : l,
      ),
    );
  }

  function onCustomerChange(id: number) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) setDueDate(addDays(issueDate, c.paymentTermDays));
  }

  async function onSave() {
    setSaving(true);
    try {
      const res = await saveInvoice({
        data: {
          actorRole: role as Role,
          id: invoice?.id,
          customerId,
          seriesId,
          issueDate,
          dueDate,
          notes: notes || null,
          items: lines.map((l) => ({
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            taxRateId: l.taxRateId,
          })),
        },
      });
      toast.success(invoice ? "Đã lưu hóa đơn" : "Đã tạo hóa đơn nháp");
      await navigate({ to: "/invoices/$id", params: { id: String(res.id) } });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>Khách hàng</Label>
            <Select value={String(customerId)} onValueChange={(v) => onCustomerChange(Number(v))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customers.filter((c) => c.isActive).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customer ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {customer.customerType === "enterprise" ? `MST ${customer.taxCode ?? "—"}` : "Cá nhân"}
                {customer.address ? ` · ${customer.address}` : ""}
              </p>
            ) : null}
          </div>
          <div>
            <Label>Ký hiệu</Label>
            <Select value={String(seriesId)} onValueChange={(v) => setSeriesId(Number(v))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(activeSeries.length ? activeSeries : series).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.code} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ngày phát hành</Label>
            <Input className="mt-1.5" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label>Hạn thanh toán</Label>
            <Input className="mt-1.5" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {overLimit ? (
        <div className="rounded-lg border border-warning/30 bg-warning-foreground px-4 py-3 text-sm text-warning">
          Vượt hạn mức tín dụng {customer?.name}: hạn mức {customer?.creditLimit?.toLocaleString("vi-VN")} ₫, công nợ dự kiến{" "}
          {projectedDebt.toLocaleString("vi-VN")} ₫.
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Hàng hóa / dịch vụ</th>
                  <th className="w-24 px-2 py-3 font-medium">SL</th>
                  <th className="w-32 px-2 py-3 font-medium">Đơn giá</th>
                  <th className="w-20 px-2 py-3 font-medium">% CK</th>
                  <th className="w-28 px-2 py-3 font-medium">Thuế</th>
                  <th className="w-32 px-2 py-3 text-right font-medium">Thành tiền</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {computed.map((line) => (
                  <tr key={line.key} className="border-b border-border/70">
                    <td className="px-4 py-2">
                      <Select
                        value={line.productId ? String(line.productId) : "custom"}
                        onValueChange={(v) => {
                          if (v === "custom") {
                            setLines((p) => p.map((l) => (l.key === line.key ? { ...l, productId: null } : l)));
                          } else applyProduct(line.key, Number(v));
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Chọn sản phẩm" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Nhập tay</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.code} — {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="mt-1.5 h-9"
                        value={line.description}
                        placeholder="Mô tả"
                        onChange={(e) =>
                          setLines((p) => p.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className="h-9"
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((p) =>
                            p.map((l) => (l.key === line.key ? { ...l, quantity: Number(e.target.value) } : l)),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className="h-9"
                        type="number"
                        min={0}
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((p) =>
                            p.map((l) => (l.key === line.key ? { ...l, unitPrice: Number(e.target.value) } : l)),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className="h-9"
                        type="number"
                        min={0}
                        max={100}
                        value={line.discountPercent}
                        onChange={(e) =>
                          setLines((p) =>
                            p.map((l) =>
                              l.key === line.key ? { ...l, discountPercent: Number(e.target.value) } : l,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={String(line.taxRateId)}
                        onValueChange={(v) =>
                          setLines((p) => p.map((l) => (l.key === line.key ? { ...l, taxRateId: Number(v) } : l)))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {taxRates.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.rate}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatVnd(line.total)}</td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground"
                        onClick={() => setLines((p) => (p.length === 1 ? p : p.filter((l) => l.key !== line.key)))}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
            <Button type="button" variant="outline" onClick={() => setLines((p) => [...p, newLine(defaultTax)])}>
              <Plus className="h-4 w-4" />
              Thêm dòng
            </Button>
            <div className="min-w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Cộng tiền hàng</span>
                <span className="tabular-nums text-foreground">{formatVnd(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Thuế GTGT</span>
                <span className="tabular-nums text-foreground">{formatVnd(totals.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-medium">
                <span>Tổng thanh toán</span>
                <span className="font-display text-lg tabular-nums">{formatVnd(totals.totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <Label>Ghi chú nội bộ</Label>
        <Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Đang lưu…" : invoice ? "Lưu thay đổi" : "Lưu nháp"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/invoices" })}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
