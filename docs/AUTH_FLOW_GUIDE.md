# 🔐 Hướng dẫn Luồng Đăng ký & Đăng nhập (Auth Flow)
## Hệ thống EHR Blockchain — Kiến trúc "Ví là Danh tính"

Hệ thống đã được cập nhật sang mô hình hiện đại: **Đăng nhập bằng ví chính là hành động Đăng ký**. Bệnh nhân không cần điền form rườm rà, mọi việc xác thực và định danh đều dựa trên chữ ký số MetaMask.

---

## 1. Luồng dành cho Bệnh nhân (Patient)

Triết lý: **Đăng nhập lần đầu = Tự động tạo tài khoản (Off-chain) -> Chờ Admin duyệt (On-chain).**

### Bước 1: Đăng nhập & Khởi tạo tài khoản (Không tốn Gas)
1. **Frontend:** Người dùng bấm nút "Login with MetaMask".
2. **API Get Nonce:** Gọi `POST /v1/auth/login/wallet` với `{ "walletAddress": "0x..." }`.
3. **Ký thông điệp:** Frontend gọi MetaMask để người dùng ký chuỗi `nonce` nhận được.
4. **API Verify:** Gọi lại `POST /v1/auth/login/wallet` kèm theo `signature`.
5. **Logic Backend:** 
   - Hệ thống kiểm tra ví. Nếu ví mới 100%, tự động tạo User trong MongoDB với `role: PATIENT` và `status: PENDING`.
   - Trả về JWT Token (Cookie).
6. **UX Gợi ý:** Nếu Response trả về `status: PENDING`, Frontend hiển thị thông báo: *"Tài khoản của bạn đã được khởi tạo. Vui lòng chờ Quản trị viên bệnh viện phê duyệt để bắt đầu sử dụng."*

### Bước 2: Quản trị viên Phê duyệt (Admin trả Gas)
Bệnh nhân lúc này đã vào được hệ thống nhưng bị chặn bởi middleware `checkActiveStatus`, không thể thực hiện các thao tác y tế.
1. **Admin Dashboard:** Admin vào danh sách user `PENDING`, đối chiếu hồ sơ thực tế.
2. **API Prepare:** Gọi `POST /v1/admins/users/:id/approve/prepare`. Backend trả về `txRequest`.
3. **MetaMask (Admin):** Admin ký giao dịch để gọi hàm `addPatient(walletAddress)` trên Smart Contract.
4. **API Confirm:** Frontend Admin gửi `txHash` về `POST /v1/admins/users/:id/approve/confirm`.
5. **Hoàn tất:** User chuyển thành `ACTIVE`. Kể từ giây phút này, Bệnh nhân có thể sử dụng mọi tính năng.

---

## 2. Luồng dành cho Nhân viên Y tế (Doctor / Lab Tech)

Triết lý: **Admin trực tiếp tạo danh tính trên Blockchain trước khi cấp quyền truy cập.**

### Bước 1: Khởi tạo (Do Admin thực hiện)
1. Admin nhập thông tin Bác sĩ/Kỹ thuật viên vào form.
2. **API Prepare:** Gọi `POST /v1/admins/users/create-doctor` (hoặc `create-labtech`).
3. **MetaMask:** Admin ký giao dịch gọi hàm `addDoctor` / `addLabTech` trên Blockchain.
4. **API Confirm:** Gửi `txHash` để chốt lưu vào MongoDB với trạng thái `ACTIVE`.

### Bước 2: Đăng nhập
Bác sĩ/Lab Tech có thể đăng nhập bằng tài khoản (CCCD/Pass) hoặc đăng nhập bằng ví MetaMask giống như Bệnh nhân ở mục 1. Do Admin đã ghi danh ví của họ từ trước nên họ sẽ vào thẳng trạng thái `ACTIVE`.

---

## 3. Luồng dành cho Quản trị viên (Admin)

Để bảo mật, Admin chỉ sử dụng tài khoản nội bộ, không dùng ví.
1. **API:** `POST /v1/admins/auth/login` dùng `nationId` và `password`.
2. **Hạn chế:** Admin bị chặn không cho phép đăng nhập qua cổng `/v1/auth/login/wallet`.

---

## 4. Các điểm lưu ý kỹ thuật (Dành cho Developer)

### Kiểm soát trạng thái (Security Middleware)
Backend sử dụng middleware `checkActiveStatus` để bảo vệ các route nhạy cảm.
- **Cho phép PENDING:** Xem profile (`/v1/users/me`), xem danh sách lab-orders của mình (để biết trạng thái).
- **Chặn PENDING:** Tạo Medical Record, Cấp quyền Access Control, Nhập kết quả Lab... (Trả về lỗi `403 Forbidden`).

### Tổng kết API chính:
| Chức năng | Endpoint | Method | Role |
| :--- | :--- | :--- | :--- |
| Đăng nhập ví | `/v1/auth/login/wallet` | POST | Tất cả (trừ Admin) |
| Đăng ký (Legacy) | `/v1/auth/register` | POST | Patient (Optional) |
| Duyệt User (1) | `/v1/admins/users/:id/approve/prepare` | POST | Admin |
| Duyệt User (2) | `/v1/admins/users/:id/approve/confirm` | POST | Admin |
| Từ chối User | `/v1/admins/users/:id/reject` | PATCH | Admin (Off-chain) |

---
**Người soạn:** Backend Team
**Cập nhật:** April 2026
