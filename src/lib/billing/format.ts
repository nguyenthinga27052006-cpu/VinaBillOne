import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import type { InvoiceStatus, PaymentStatus, Role } from "./types";

export function formatVnd(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function formatVndCompact(amount: number): string {
  const n = Math.round(Number.isFinite(amount) ? amount : 0);
  if (Math.abs(n) >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  return formatVnd(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.slice(0, 10)), "dd/MM/yyyy", { locale: vi });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: vi });
  } catch {
    return iso;
  }
}

export function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  return `T${Number(m)}/${y}`;
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Nháp",
  pending: "Chờ duyệt",
  issued: "Đã phát hành",
  partial: "Thanh toán một phần",
  paid: "Đã thanh toán",
  overdue: "Quá hạn",
  adjusted: "Đã điều chỉnh",
  cancelled: "Đã hủy",
};

export const STATUS_TONE: Record<
  InvoiceStatus,
  "muted" | "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "muted",
  pending: "info",
  issued: "neutral",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  adjusted: "muted",
  cancelled: "muted",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  reversed: "Đã đảo ngược",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị",
  chief: "Kế toán trưởng",
  accountant: "Kế toán",
  viewer: "Chỉ xem",
};

export const ROLE_NAME: Record<Role, string> = {
  admin: "Lê Minh Quân",
  chief: "Phạm Thu Hà",
  accountant: "Ngô Thanh Tùng",
  viewer: "Đặng Mai Chi",
};

function docSo3ChuSo(baso: number, daydu: boolean): string {
  const chuSo = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const tram = Math.floor(baso / 100);
  const chuc = Math.floor((baso % 100) / 10);
  const donvi = baso % 10;
  let kq = "";
  if (tram > 0) {
    kq += chuSo[tram] + " trăm ";
  } else if (daydu) {
    kq += "không trăm ";
  }
  if (chuc > 1) {
    kq += chuSo[chuc] + " mươi ";
    if (donvi === 1) kq += "mốt ";
    else if (donvi === 5) kq += "lăm ";
    else if (donvi > 0) kq += chuSo[donvi] + " ";
  } else if (chuc === 1) {
    kq += "mười ";
    if (donvi === 5) kq += "lăm ";
    else if (donvi > 0) kq += chuSo[donvi] + " ";
  } else {
    if ((tram > 0 || daydu) && donvi > 0) kq += "lẻ ";
    if (donvi > 0) kq += chuSo[donvi] + " ";
  }
  return kq;
}

export function docTienBangChu(amount: number): string {
  if (amount === 0) return "Không đồng";
  if (!amount || Number.isNaN(amount)) return "";
  const n = Math.round(Math.abs(amount));
  const donViLop = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  let chuoi = "";
  let i = 0;
  let conLai = n;
  while (conLai > 0) {
    const baso = conLai % 1000;
    if (baso > 0) {
      const doc = docSo3ChuSo(baso, conLai > 999);
      chuoi = doc + donViLop[i] + " " + chuoi;
    }
    conLai = Math.floor(conLai / 1000);
    i++;
  }
  chuoi = chuoi.trim().replace(/\s+/g, " ");
  if (!chuoi) return "Không đồng";
  return chuoi.charAt(0).toUpperCase() + chuoi.slice(1) + " đồng chẵn";
}

export function getVietQrUrl(params: {
  bankName: string;
  bankAccount: string;
  amount: number;
  memo: string;
  accountName?: string;
}): string {
  const bankUpper = (params.bankName || "").toUpperCase();
  let bin = "vietcombank";
  if (bankUpper.includes("TECHCOM") || bankUpper.includes("TCB")) bin = "techcombank";
  else if (bankUpper.includes("VIETCOM") || bankUpper.includes("VCB")) bin = "vietcombank";
  else if (bankUpper.includes("MB") || bankUpper.includes("QUÂN ĐỘI")) bin = "mbbank";
  else if (bankUpper.includes("BIDV")) bin = "bidv";
  else if (bankUpper.includes("VIETIN") || bankUpper.includes("CTG")) bin = "vietinbank";
  else if (bankUpper.includes("ACB")) bin = "acb";
  else if (bankUpper.includes("VPB") || bankUpper.includes("VP")) bin = "vpbank";
  else if (bankUpper.includes("TPB") || bankUpper.includes("TIÊN PHONG")) bin = "tpb";
  else if (bankUpper.includes("SACOMBANK") || bankUpper.includes("STB")) bin = "sacombank";

  const cleanAcc = params.bankAccount.replace(/\s+/g, "");
  const amount = Math.round(Math.max(0, params.amount));
  const memoEnc = encodeURIComponent(params.memo);
  const nameEnc = encodeURIComponent(params.accountName ?? "");
  return `https://img.vietqr.io/image/${bin}-${cleanAcc}-compact2.png?amount=${amount}&addInfo=${memoEnc}&accountName=${nameEnc}`;
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val == null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const csvContent =
    "\uFEFF" +
    [
      headers.map(escapeCell).join(","),
      ...rows.map((row) => row.map(escapeCell).join(",")),
    ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

