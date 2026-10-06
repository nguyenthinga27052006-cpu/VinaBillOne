import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Building2, Key, Plus, ShieldCheck, Tag, Users } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSettings, saveInvoiceSeries, saveSettings, saveStaff } from "@/lib/billing/api";
import { errMsg } from "@/lib/billing/client";
import { ROLE_LABEL, ROLE_NAME } from "@/lib/billing/format";
import { can } from "@/lib/billing/roles";
import { ROLES, type CompanySettings, type Role } from "@/lib/billing/types";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  component: SettingsPage,
});

function SettingsPage() {
  const data = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();

  const [form, setForm] = useState<CompanySettings>(data.company);
  const [saving, setSaving] = useState(false);
  const writable = can(role, "settings.write");

  // Series modal state
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [seriesYear, setSeriesYear] = useState(new Date().getFullYear());
  const [seriesActive, setSeriesActive] = useState(true);

  // Staff modal state
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<Role>("accountant");

  return (
    <div>
      <PageHeader
        eyebrow="Hệ thống"
        title="Cấu hình & Quản trị"
        description="Thông tin doanh nghiệp, ký hiệu hóa đơn, quản lý nhân viên và danh mục thuế suất."
      />

      <Tabs defaultValue="company" className="mt-2">
        <TabsList className="mb-4">
          <TabsTrigger value="company">
            <Building2 className="mr-1.5 h-4 w-4" />
            Đơn vị bán hàng
          </TabsTrigger>
          <TabsTrigger value="series">
            <Key className="mr-1.5 h-4 w-4" />
            Ký hiệu hóa đơn ({data.series.length})
          </TabsTrigger>
          <TabsTrigger value="staff">
            <Users className="mr-1.5 h-4 w-4" />
            Nhân viên & Phân quyền ({data.staff?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="tax">
            <Tag className="mr-1.5 h-4 w-4" />
            Thuế suất ({data.taxRates.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: COMPANY */}
        <TabsContent value="company">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Thông tin doanh nghiệp phát hành</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!writable) return;
                  setSaving(true);
                  try {
                    await saveSettings({ data: { actorRole: role, company: form } });
                    toast.success("Đã lưu thông tin doanh nghiệp");
                    await router.invalidate();
                  } catch (err) {
                    toast.error(errMsg(err));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <div className="sm:col-span-2">
                  <Label>Tên công ty / Đơn vị bán hàng</Label>
                  <Input
                    className="mt-1"
                    value={form.name ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Mã số thuế</Label>
                  <Input
                    className="mt-1"
                    value={form.taxCode ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Người đại diện pháp luật</Label>
                  <Input
                    className="mt-1"
                    value={form.legalRep ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, legalRep: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Địa chỉ trụ sở</Label>
                  <Input
                    className="mt-1"
                    value={form.address ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    className="mt-1"
                    value={form.email ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Số điện thoại</Label>
                  <Input
                    className="mt-1"
                    value={form.phone ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tên ngân hàng mở tài khoản</Label>
                  <Input
                    className="mt-1"
                    value={form.bankName ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Số tài khoản ngân hàng</Label>
                  <Input
                    className="mt-1"
                    value={form.bankAccount ?? ""}
                    disabled={!writable}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  {writable ? (
                    <Button type="submit" disabled={saving}>
                      {saving ? "Đang lưu…" : "Lưu thay đổi"}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Quý vị đang xem ở vai trò chỉ xem hoặc kế toán. Chỉ Quản trị viên (Admin) mới
                      có quyền chỉnh sửa cấu hình này.
                    </p>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: SERIES */}
        <TabsContent value="series" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Dải ký hiệu hóa đơn giá trị gia tăng được đăng ký theo Nghị định 123 và Thông tư 78.
            </p>
            {writable ? (
              <Button onClick={() => setSeriesOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Thêm dải ký hiệu
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ký hiệu</TableHead>
                  <TableHead>Tên loại hóa đơn</TableHead>
                  <TableHead>Năm</TableHead>
                  <TableHead className="text-right">Số hóa đơn hiện tại</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.series.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-semibold text-primary">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.year}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {String(s.currentNumber).padStart(7, "0")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "success" : "muted"}>
                        {s.isActive ? "Đang sử dụng" : "Đã khóa"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3: STAFF */}
        <TabsContent value="staff" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Quản lý danh sách nhân sự và phân quyền kiểm soát vòng đời hóa đơn, thanh toán.
            </p>
            {writable ? (
              <Button onClick={() => setStaffOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Thêm nhân viên
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ và tên</TableHead>
                  <TableHead>Email đăng nhập</TableHead>
                  <TableHead>Vai trò chức danh</TableHead>
                  <TableHead>Quyền hạn</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.staff ?? []).map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="font-medium">{st.fullName}</TableCell>
                    <TableCell className="font-mono text-xs">{st.email}</TableCell>
                    <TableCell>{ROLE_LABEL[st.role] ?? st.role}</TableCell>
                    <TableCell>
                      {st.role === "admin" && (
                        <span className="text-xs text-primary font-medium">Toàn quyền hệ thống, xóa nháp</span>
                      )}
                      {st.role === "chief" && (
                        <span className="text-xs text-emerald-600 font-medium">Duyệt, phát hành, điều chỉnh, nhắc nợ</span>
                      )}
                      {st.role === "accountant" && (
                        <span className="text-xs text-amber-600 font-medium">Lập nháp, ghi nhận thu tiền</span>
                      )}
                      {st.role === "viewer" && (
                        <span className="text-xs text-muted-foreground">Chỉ xem dữ liệu</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.isActive ? "success" : "muted"}>
                        {st.isActive ? "Hoạt động" : "Tạm khóa"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 4: TAX RATES */}
        <TabsContent value="tax" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Danh mục các mức thuế suất giá trị gia tăng được áp dụng trên hóa đơn theo Luật Thuế GTGT.
          </p>
          <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] max-w-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên thuế suất</TableHead>
                  <TableHead className="text-right">Mức thuế (%)</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.taxRates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono font-bold">
                      {t.rate}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.isActive ? "success" : "muted"}>
                        {t.isActive ? "Đang áp dụng" : "Ngừng áp dụng"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Series Modal */}
      <Dialog open={seriesOpen} onOpenChange={setSeriesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm dải ký hiệu hóa đơn mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label>Mã ký hiệu (VD: 1C26TAA, 1C26TBB...)</Label>
              <Input
                className="mt-1 font-mono uppercase"
                value={seriesCode}
                onChange={(e) => setSeriesCode(e.target.value.toUpperCase())}
                placeholder="1C26TAA"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Ký tự 1: Loại HĐ GTGT · C: Có mã CQT · 26: Năm phát hành 2026 · T: DN áp dụng
              </p>
            </div>
            <div>
              <Label>Tên mô tả</Label>
              <Input
                className="mt-1"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                placeholder="Hóa đơn GTGT năm 2026"
              />
            </div>
            <div>
              <Label>Năm phát hành</Label>
              <Input
                type="number"
                className="mt-1"
                value={seriesYear}
                onChange={(e) => setSeriesYear(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriesOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={async () => {
                if (!seriesCode.trim()) {
                  toast.error("Vui lòng nhập mã ký hiệu");
                  return;
                }
                try {
                  await saveInvoiceSeries({
                    data: {
                      actorRole: role,
                      series: {
                        code: seriesCode.trim(),
                        name: seriesName.trim() || `Hóa đơn GTGT năm ${seriesYear}`,
                        prefix: "",
                        year: seriesYear,
                        isActive: seriesActive,
                      },
                    },
                  });
                  toast.success("Đã thêm ký hiệu hóa đơn mới");
                  setSeriesOpen(false);
                  setSeriesCode("");
                  setSeriesName("");
                  await router.invalidate();
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Lưu ký hiệu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Staff Modal */}
      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm tài khoản nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label>Họ và tên</Label>
              <Input
                className="mt-1"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="VD: Trần Văn Nam"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                className="mt-1"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="nam.tv@vinabill.vn"
              />
            </div>
            <div>
              <Label>Vai trò</Label>
              <Select value={staffRole} onValueChange={(v) => setStaffRole(v as Role)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={async () => {
                if (!staffName.trim() || !staffEmail.trim()) {
                  toast.error("Vui lòng nhập họ tên và email");
                  return;
                }
                try {
                  await saveStaff({
                    data: {
                      actorRole: role,
                      staff: {
                        fullName: staffName.trim(),
                        email: staffEmail.trim(),
                        role: staffRole,
                        isActive: true,
                      },
                    },
                  });
                  toast.success("Đã thêm nhân viên thành công");
                  setStaffOpen(false);
                  setStaffName("");
                  setStaffEmail("");
                  await router.invalidate();
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Lưu nhân viên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
