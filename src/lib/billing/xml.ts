import { formatInvoiceNumber } from "./calc";
import type { CompanySettings, InvoiceDetail } from "./types";

function esc(s: string | null | undefined): string {
  const map: Record<string, string> = {
    "&": "\u0026amp;",
    "<": "\u0026lt;",
    ">": "\u0026gt;",
    '"': "\u0026quot;",
    "'": "\u0026apos;",
  };
  return (s ?? "").replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}


export function buildInvoiceXml(
  invoice: InvoiceDetail,
  company: CompanySettings,
): string {
  const number = formatInvoiceNumber(Number(invoice.invoiceNumber) || 0);
  const lines = invoice.items
    .map(
      (it, i) => `      <HHDVu>
        <STT>${i + 1}</STT>
        <MHHDVu>${esc(it.productCode)}</MHHDVu>
        <THHDVu>${esc(it.description)}</THHDVu>
        <DVTinh>${esc(it.unit)}</DVTinh>
        <SLuong>${it.quantity}</SLuong>
        <DGia>${it.unitPrice}</DGia>
        <TLCKhau>${it.discountPercent}</TLCKhau>
        <TSuat>${it.taxRate}</TSuat>
        <ThTien>${it.lineTotal}</ThTien>
      </HHDVu>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<HDon xmlns="http://kekhaithue.gdt.gov.vn/TBaoThue">
  <DLHDon>
    <TTChung>
      <PBan>2.1.0</PBan>
      <THDon>Hóa đơn giá trị gia tăng</THDon>
      <KHMSHDon>${esc(invoice.seriesCode)}</KHMSHDon>
      <KHHDon>${esc(invoice.seriesCode)}</KHHDon>
      <SHDon>${esc(number)}</SHDon>
      <NLap>${esc(invoice.issueDate)}</NLap>
      <DVTTe>VND</DVTTe>
      <MCCQT>${esc(invoice.eInvoiceId)}</MCCQT>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>${esc(company.name)}</Ten>
        <MST>${esc(company.taxCode)}</MST>
        <DChi>${esc(company.address)}</DChi>
        <SDThoai>${esc(company.phone)}</SDThoai>
        <DCTDTu>${esc(company.email)}</DCTDTu>
        <STKNHang>${esc(company.bankAccount)}</STKNHang>
        <TNHang>${esc(company.bankName)}</TNHang>
      </NBan>
      <NMua>
        <Ten>${esc(invoice.customerName)}</Ten>
        <MST>${esc(invoice.customerTaxCode)}</MST>
        <DChi>${esc(invoice.customerAddress)}</DChi>
        <SDThoai>${esc(invoice.customerPhone)}</SDThoai>
        <DCTDTu>${esc(invoice.customerEmail)}</DCTDTu>
      </NMua>
      <DSHHDVu>
${lines}
      </DSHHDVu>
      <TToan>
        <TgTCThue>${invoice.subtotal}</TgTCThue>
        <TgTThue>${invoice.taxAmount}</TgTThue>
        <TgTTTBSo>${invoice.totalAmount}</TgTTTBSo>
        <DViet>Việt Nam Đồng</DViet>
      </TToan>
    </NDHDon>
  </DLHDon>
</HDon>
`;
}
