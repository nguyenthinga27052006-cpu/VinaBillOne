# VinaBillOne — Hệ thống Quản trị Hóa đơn điện tử & Công nợ Doanh nghiệp

Hệ thống quản lý hóa đơn điện tử toàn diện theo quy định pháp luật Việt Nam (**Nghị định 123/2020/NĐ-CP** & **Thông tư 78/2021/TT-BTC**), tích hợp đối soát công nợ, thanh toán VietQR và báo cáo tài chính theo **Thông tư 200/133/TT-BTC**.

---

## 🌟 Tính năng chính

### 1. Quản lý Hóa đơn điện tử (E-Invoicing)
- **Vòng đời hóa đơn đầy đủ**: Tạo bản nháp, gửi phê duyệt, ký số & cấp mã Cơ quan Thuế (CQT), phát hành, hủy hóa đơn, xóa hóa đơn nháp.
- **Hóa đơn điều chỉnh & Hóa đơn thay thế**: Lập hóa đơn điều chỉnh (tăng/giảm) và thay thế theo Điều 19 Nghị định 123/2020/NĐ-CP kèm biên bản thỏa thuận.
- **Bản in HĐGTGT chuẩn chuẩn Bộ Tài chính**:
  - Đầy đủ Quốc hiệu, Tiêu ngữ, Ký hiệu (1C26TBB), Số hóa đơn, Mã tra cứu, Mã CQT.
  - **Số tiền bằng chữ (`docTienBangChu`)**: Tự động chuyển đổi số tiền thành chữ tiếng Việt chuẩn quy định kế toán.
  - **Chế độ Hóa đơn chuyển đổi từ HĐĐT**: Chuyển đổi ra giấy theo Điều 7 Nghị định 123/2020/NĐ-CP (ghi rõ ngày chuyển đổi, người thực hiện chuyển đổi và giá trị pháp lý).
  - **Mã thanh toán VietQR**: Tích hợp chuẩn NAPAS 247 cho từng hóa đơn giúp khách hàng quét app ngân hàng thanh toán tức thì.
- **Cổng Tra cứu Hóa đơn trực tuyến (`/lookup`)**: Cho phép khách mua tra cứu hóa đơn theo số HĐ, mã CQT hoặc mã số thuế bên mua; tải file XML gốc chuẩn TT78 và PDF bản thể hiện.

### 2. Quản lý Thanh toán & Công nợ
- **Thanh toán đa phương thức**: Tiền mặt, chuyển khoản ngân hàng, thẻ, cấn trừ công nợ.
- **Thanh toán nhanh 1-chạm**: Thu tiền và phân bổ tự động vào hóa đơn ngay từ màn hình chi tiết HĐ.
- **In Phiếu thu tiền (Mẫu 01-TT)**: Theo chế độ kế toán Thông tư 200/2014/TT-BTC & TT 133/2016/TT-BTC với đầy đủ chữ ký Giám đốc, Kế toán trưởng, Thủ quỹ, Người nộp tiền.
- **Biên bản Đối soát công nợ (Customer Statement)**: Lập bảng kê chi tiết Nợ (Hóa đơn) / Có (Thanh toán), tính toán số dư công nợ lũy kế, lọc khoảng thời gian và in biên bản xác nhận công nợ.
- **Tự động hóa Nhắc nợ (Dunning Automation)**: Cấu hình quy tắc nhắc nợ (trước hạn, đến hạn, quá hạn 7/15/30 ngày) và gửi thông báo nhắc nợ trực tiếp kèm nhật ký email.

### 3. Báo cáo & Thống kê Thuế
- **Báo cáo doanh thu & Bảng kê bán ra (Mẫu 01-1/GTGT)**: Phân bổ doanh thu theo từng mức thuế suất (0%, 5%, 8%, 10%, không chịu thuế).
- **Báo cáo tình hình sử dụng hóa đơn (BC26/HĐ)**: Thống kê tổng số lượng hóa đơn phát hành, tồn đầu kỳ, đã sử dụng, xóa bỏ, hủy theo từng ký hiệu.
- **Báo cáo tuổi nợ (Aging Report)**: Phân loại công nợ theo các kỳ hạn quá hạn (trong hạn, 1-30 ngày, 31-60 ngày, >60 ngày).
- **Xuất dữ liệu Excel/CSV (UTF-8 BOM)**: Hỗ trợ trích xuất toàn bộ dữ liệu (Hóa đơn, Khách hàng, Thanh toán, Nhắc nợ, Báo cáo) ra file CSV chuẩn UTF-8, mở trực tiếp trên Excel không bị lỗi font tiếng Việt.

### 4. Cấu hình Hệ thống & Phân quyền
- **Quản lý Dải ký hiệu HĐ (Series Management)**: Tạo và quản lý ký hiệu hóa đơn cho từng năm tài chính mới.
- **Quản lý Nhân viên & Phân quyền (RBAC)**: Kế toán viên, Kế toán trưởng, Giám đốc, Quản trị viên, Khách xem.
- **Quản lý Thuế suất & Thông tin doanh nghiệp**: Tùy chỉnh thông tin người bán, tài khoản ngân hàng thụ hưởng VietQR, chữ ký số.

---

## 🚀 Hướng dẫn cài đặt & Chạy ứng dụng

### Yêu cầu hệ thống
- **Node.js** >= 18 (Khuyến nghị Node 20 hoặc 22)
- **npm** hoặc **pnpm** / **yarn**

### Cài đặt dependencies
```bash
npm install
```

### Chạy chế độ Phát triển (Dev)
```bash
npm run dev
```
Ứng dụng sẽ khởi chạy tại: `http://localhost:8080/`

### Kiểm tra kiểu dữ liệu (TypeScript)
```bash
npm run typecheck
```

### Xây dựng bản Production (Build)
```bash
npm run build
```

---

## 🛠️ Công nghệ sử dụng
- **Frontend / Framework**: React 19, TanStack Start, TanStack Router, TanStack Query
- **Styling**: Tailwind CSS v4, Lucide Icons, Radix UI
- **Cơ sở dữ liệu**: PostgreSQL / @electric-sql/pglite (nhúng WASM không cần cài PostgreSQL server cục bộ)
- **Tích hợp**: VietQR API (NAPAS 247), Định dạng tiền tệ & số tiền bằng chữ tiếng Việt, Xuất CSV UTF-8 BOM

---

## 📄 Bản quyền
Phát triển bởi đội ngũ VinaBillOne. Giấy phép mã nguồn mở MIT.
