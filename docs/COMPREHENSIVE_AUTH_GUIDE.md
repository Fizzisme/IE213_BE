# 🔐 Hướng dẫn Chi tiết Luồng Xác thực & Định danh (Comprehensive Auth Guide)
## Dự án: EHR Blockchain System — Version 3.0

Tài liệu này mô tả kiến trúc **"Ví là Danh tính" (Wallet as Identity)** và cơ chế **"Duyệt On-chain Tập trung"**. Hệ thống ưu tiên sự đơn giản cho người dùng cuối (Bệnh nhân) và tính bảo mật tuyệt đối trên Blockchain thông qua vai trò Quản trị viên.

---

## 1. LUỒNG DÀNH CHO BỆNH NHÂN (PATIENT FLOW)

Triết lý cốt lõi: **Đăng nhập lần đầu chính là Đăng ký.** Hệ thống xóa bỏ rào cản về việc điền form và phí Gas cho Bệnh nhân.

### Bước 1: Xác thực Ví & Khởi tạo (Off-chain)
Người dùng chỉ cần sở hữu ví MetaMask. Toàn bộ thông tin định danh ban đầu dựa trên chữ ký số.

1.  **Giao diện (Frontend):** Bấm nút "Đăng nhập bằng MetaMask".
2.  **Lấy mã thử thách (API):**
    - `POST /v1/auth/login/wallet`
    - Body: `{ "walletAddress": "0x..." }`
    - Response: `{ "nonce": "Login 1713000000000 - uuid..." }`
3.  **Ký thông điệp (MetaMask):** Frontend gọi lệnh `personal_sign` để người dùng ký chuỗi nonce (Không tốn Gas).
4.  **Xác thực chữ ký (API):**
    - `POST /v1/auth/login/wallet`
    - Body: `{ "walletAddress": "0x...", "signature": "0x..." }`
5.  **Xử lý tại Backend (`auth.service.js`):**
    - Nếu ví mới: Tự động tạo bản ghi trong MongoDB (`role: PATIENT`, `status: PENDING`).
    - Trả về JWT Token (nhét vào HTTP-only Cookie).
6.  **Phản hồi phía Frontend:**
    - Nếu nhận `status: PENDING`: Hiển thị thông báo: *"Tài khoản của bạn đã được khởi tạo thành công. Vui lòng chờ Admin phê duyệt để bắt đầu sử dụng dịch vụ y tế."*

### Bước 2: Admin Phê duyệt & Kích hoạt (On-chain)
Bệnh nhân lúc này đã vào được Dashboard nhưng các chức năng y tế (khám bệnh, xem hồ sơ) bị chặn bởi middleware `checkActiveStatus`.

1.  **Admin Dashboard:** Admin xem danh sách user `PENDING`, đối chiếu hồ sơ thực tế.
2.  **Chuẩn bị giao dịch (API Prepare):**
    - `POST /v1/admins/users/:id/approve/prepare`
    - Response: `{ "txRequest": { ... } }` (Transaction thô gọi hàm `addPatient` trên Blockchain).
3.  **Ký duyệt (MetaMask Admin):** Admin dùng ví Quản trị ký và **trả phí Gas** để "neo" ví bệnh nhân lên Blockchain.
4.  **Xác nhận (API Confirm):**
    - `POST /v1/admins/users/:id/approve/confirm`
    - Body: `{ "txHash": "0x..." }`
5.  **Kết quả:** User chuyển thành `ACTIVE` trong Database. Bệnh nhân có thể bắt đầu sử dụng toàn bộ hệ thống.

---

## 2. LUỒNG NHÂN VIÊN Y TẾ (DOCTOR / LAB TECH)

Nhân viên y tế tuân thủ luồng "Định danh chính danh" do Admin bệnh viện kiểm soát.

### Bước 1: Khởi tạo Danh tính
1.  **Admin Dashboard:** Admin nhập thông tin: Email, Password, NationID, Wallet Address của nhân viên.
2.  **Prepare API:** `POST /v1/admins/users/create-doctor` (hoặc `create-labtech`).
3.  **MetaMask Admin:** Ký giao dịch `addDoctor`/`addLabTech` lên Blockchain.
4.  **Confirm API:** Gửi `txHash` để chốt tài khoản `ACTIVE` trong Database.

### Bước 2: Đăng nhập
Bác sĩ/Lab Tech có 2 cách vào hệ thống:
- **Cách 1 (Web2):** Dùng `nationId` và `password` qua API `/v1/auth/login/nationId`.
- **Cách 2 (Web3):** Dùng ví MetaMask ký nonce qua API `/v1/auth/login/wallet` (Giống luồng Bệnh nhân nhưng vào thẳng trạng thái `ACTIVE`).

---

## 3. LUỒNG QUẢN TRỊ VIÊN (ADMIN)

Admin là "Root User", được bảo vệ nghiêm ngặt.
1.  **Đăng nhập:** Chỉ dùng `nationId` và `password` qua endpoint riêng: `POST /v1/admins/auth/login`.
2.  **Ràng buộc:** Admin **không được phép** đăng nhập bằng ví MetaMask để tránh rủi ro chiếm quyền điều khiển On-chain.

---

## 4. TỔNG KẾT THAY ĐỔI TRÊN BACKEND (Dành cho Dev)

### 1. Cập nhật Model & Validation
- **`auth.validation.js`**: `email`, `password`, `nationId` giờ là **Optional**. Chỉ có `walletAddress` là bắt buộc.
- **`auth.service.js`**: Hàm `verifyWalletLogin` hiện tại là "cỗ máy 2 trong 1": Vừa xác thực ví, vừa tự động đăng ký tài khoản Bệnh nhân nếu chưa có.

### 2. Quản lý trạng thái thông minh
- **Duyệt (Approve):** Chuyển sang luồng On-chain 2 bước (Prepare/Confirm) để đồng bộ ví lên Blockchain.
- **Từ chối / Xóa (Reject / Soft Delete):** Thực hiện **Off-chain 100%** (chỉ update MongoDB). Lý do: Trên Blockchain chỉ lưu người tốt (ACTIVE), không cần tốn Gas lưu người bị từ chối.

### 3. Lớp bảo mật Middleware
- **`checkActiveStatus.js`**: Middleware này được áp dụng cho toàn bộ các route nghiệp vụ (LabOrder, AccessControl, Doctor).
- Nó đảm bảo kể cả khi một user `PENDING` đánh cắp được Token, họ cũng không thể thực hiện bất kỳ giao dịch y tế nào.

---

## 💡 GỢI Ý CHO FRONTEND (UX/UI Tips)

1.  **Nút "Login with MetaMask":** Đây nên là nút to nhất ở trang chủ.
2.  **Feedback cho User PENDING:** Khi Bệnh nhân đăng nhập lần đầu, thay vì hiện Dashboard trống, hãy hiện một màn hình Welcome kèm trạng thái: *"Hồ sơ đang chờ duyệt - 🕒 70% hoàn tất"*.
3.  **Wallet Tooltip:** Luôn hiển thị địa chỉ ví rút gọn (VD: `0x71C...4fEB`) ở góc màn hình để người dùng biết họ đang đăng nhập bằng ví nào.

---
**Người soạn:** Backend Team
**Cập nhật:** April 2026
**Phiên bản:** 3.1 - Wallet as Identity Support
