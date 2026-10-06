import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { BellRing, Download, Mail, Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/layout/role-context";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listReminders, runReminders, saveReminderRule } from "@/lib/billing/api";
import { errMsg } from "@/lib/billing/client";
import { exportToCsv, formatDateTime } from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";

export const Route = createFileRoute("/reminders")({
  loader: () => listReminders(),
  component: RemindersPage,
});

function RemindersPage() {
  const { logs, rules } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Add rule modal state
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [daysOverdue, setDaysOverdue] = useState(7);
  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(
    "Kính gửi {customer_name}, Hóa đơn {invoice_number} đã quá hạn {days} ngày. Vui lòng thanh toán số tiền {remaining} sớm nhất.",
  );

  function exportLogsCsv() {
    const headers = [
      "Khách hàng",
      "Số hóa đơn",
      "Kênh nhắc",
      "Trạng thái",
      "Thời gian gửi",
      "Số ngày quá hạn",
      "Nội dung nhắc nợ",
    ];
    const rows = logs.map((l) => [
      l.customerName,
      l.invoiceNumber,
      l.reminderType,
      l.status,
      l.sentAt ?? l.createdAt,
      l.daysOverdue,
      l.contentSnapshot ?? "",
    ]);
    exportToCsv(`Lich_su_nhac_no_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Công nợ"
        title="Nhắc nợ tự động"
        description="Quét hóa đơn quá hạn theo quy tắc tự động và gửi thông báo đa kênh (Email, SMS, Zalo ZNS)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportLogsCsv} disabled={logs.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất CSV
            </Button>
            {can(role, "reminder.run") ? (
              <>
                <Button variant="outline" onClick={() => setRuleOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Thêm quy tắc
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await runReminders({ data: { actorRole: role } });
                      toast.success(`Đã quét và tạo ${res.created} nhắc nợ`);
                      await router.invalidate();
                    } catch (e) {
                      toast.error(errMsg(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  Chạy job nhắc nợ
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {rules.map((r) => (
          <Card key={r.id} className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">{r.name}</CardTitle>
                <Badge variant={r.isActive ? "success" : "muted"}>
                  {r.isActive ? "Đang bật" : "Tắt"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Kênh gửi: <strong className="text-foreground uppercase">{r.channel}</strong>
              </p>
              <p>
                Kích hoạt sau: <strong className="text-foreground">{r.daysOverdue} ngày</strong> quá hạn
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <h3 className="font-display text-lg font-semibold tracking-tight">
          Lịch sử thông báo nhắc nợ ({logs.length})
        </h3>
        {logs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có lịch sử nhắc nợ nào. Nhấn "Chạy job nhắc nợ" để quét các hóa đơn quá hạn.
            </CardContent>
          </Card>
        ) : (
          logs.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  to="/invoices/$id"
                  params={{ id: String(l.invoiceId) }}
                  className="font-semibold text-primary hover:underline"
                >
                  {l.customerName} · HĐ {l.invoiceNumber}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant={l.status === "sent" ? "success" : l.status === "failed" ? "danger" : "muted"}>
                    {l.status === "sent" ? "Đã gửi" : l.status}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50">
                {l.contentSnapshot}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Kênh {l.reminderType.toUpperCase()} · {formatDateTime(l.sentAt ?? l.createdAt)} · Quá hạn{" "}
                <span className="font-semibold text-destructive">{l.daysOverdue} ngày</span>
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Rule Dialog */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm quy tắc nhắc nợ mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label>Tên quy tắc</Label>
              <Input
                className="mt-1"
                placeholder="VD: Nhắc nợ lần 4 (30 ngày)"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>
            <div>
              <Label>Số ngày quá hạn kích hoạt</Label>
              <Input
                type="number"
                min={1}
                className="mt-1"
                value={daysOverdue}
                onChange={(e) => setDaysOverdue(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Kênh thông báo</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">Tin nhắn SMS Brandname</SelectItem>
                  <SelectItem value="zalo">Zalo ZNS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mẫu nội dung thông báo</Label>
              <Textarea
                rows={3}
                className="mt-1"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Biến hỗ trợ: {"{customer_name}"}, {"{invoice_number}"}, {"{remaining}"}, {"{days}"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={async () => {
                if (!ruleName.trim()) {
                  toast.error("Vui lòng nhập tên quy tắc");
                  return;
                }
                try {
                  await saveReminderRule({
                    data: {
                      actorRole: role,
                      rule: {
                        name: ruleName.trim(),
                        daysOverdue,
                        channel,
                        template: template.trim(),
                        isActive: true,
                      },
                    },
                  });
                  toast.success("Đã thêm quy tắc nhắc nợ");
                  setRuleOpen(false);
                  setRuleName("");
                  await router.invalidate();
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Lưu quy tắc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
