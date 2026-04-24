# 📘 Cẩm nang Frontend: Triển khai luồng Nghiệp vụ Y tế
## Lab Order Workflow & Access Control (Deep Dive)

Tài liệu này giúp team Frontend hiểu sâu về logic hiển thị và cách điều phối dữ liệu giữa các vai trò.

---

## 1. LUỒNG QUẢN LÝ XÉT NGHIỆM (LAB ORDER)

### 🩺 1.1 Giao diện Bác sĩ (Doctor Dashboard)

**A. Màn hình Tạo Chỉ định:**
1.  **Dữ liệu cần chuẩn bị:**
    - `patientAddress`: Địa chỉ ví của bệnh nhân (Lấy từ profile BN).
    - `assignedLabTech`: **Địa chỉ ví** của kỹ thuật viên (Quan trọng: Phải lấy đúng ví của người được chọn).
    - `testsRequested`: Array các test (VD: `[{ code: 'GLUCOSE', name: 'Đường huyết' }]`).
2.  **Logic gọi API:**
    - Bấm "Gửi yêu cầu" -> Gọi `POST /v1/lab-orders` (Prepare).
    - Nhận `txRequest` -> Hiện popup MetaMask ký.
    - Nhận `txHash` -> Gửi kèm toàn bộ form ban đầu lên `POST /v1/lab-orders/confirm`.

**B. Màn hình Diễn giải & Chốt hồ sơ (Dành cho Order có trạng thái `RESULT_POSTED`):**
1.  **Nút "Thêm chẩn đoán":** Chỉ hiện khi `status === 'RESULT_POSTED'`.
    - Gọi API Prepare: `PATCH /v1/lab-orders/:id/interpretation`.
    - User ký MetaMask.
    - Gọi API Confirm: `PATCH /v1/lab-orders/:id/interpretation/confirm`.
2.  **Nút "Hoàn tất (Complete)":** Chỉ hiện sau khi đã có chẩn đoán (`status === 'DOCTOR_REVIEWED'`).
    - Quy trình Prepare/Confirm tương tự các bước trên.

---

### 👤 1.2 Giao diện Bệnh nhân (Patient Dashboard)

**A. Danh sách "Cần xác nhận":**
- Query API: `GET /v1/lab-orders?status=ORDERED`.
- **Nút "Đồng ý xét nghiệm":**
  - Khi BN bấm "Đồng ý" -> Gọi `PATCH /v1/lab-orders/:id/consent` (Prepare).
  - MetaMask hiện ra để BN ký (BN trả phí Gas để xác nhận quyền riêng tư).
  - Lấy `txHash` gọi `PATCH /v1/lab-orders/:id/consent/confirm`.

---

### 🧪 1.3 Giao diện Kỹ thuật viên (Lab Tech Dashboard)

**A. Danh sách "Chờ tiếp nhận":**
- Query API: `GET /v1/lab-orders?status=CONSENTED`.
- **Nút "Tiếp nhận mẫu":** Ký MetaMask để đổi trạng thái sang `IN_PROGRESS`.

**B. Danh sách "Đang xử lý":**
- Query API: `GET /v1/lab-orders?status=IN_PROGRESS`.
- **Nút "Nhập kết quả":**
  - Hiện Form cho Lab Tech nhập số liệu.
  - Khi bấm "Gửi kết quả" -> Gọi Prepare API: `PATCH /v1/lab-orders/:id/post-result`.
  - **Lưu ý:** Backend sẽ tính Hash của kết quả này và lưu On-chain. Một khi đã ký, Lab Tech **không thể sửa**.

---

## 2. LUỒNG PHÂN QUYỀN (ACCESS CONTROL)

Đây là chức năng quan trọng nhất để bảo vệ quyền riêng tư của Bệnh nhân.

### 🔐 2.1 Bệnh nhân Cấp quyền cho Bác sĩ
1.  **Form:** Nhập địa chỉ ví Bác sĩ + Chọn cấp độ (`FULL` hoặc `SENSITIVE`).
2.  **Prepare:** `POST /v1/access-control/grant`.
3.  **Confirm:** `POST /v1/access-control/confirm`.
4.  **Hiệu lực:** Ngay sau khi Block được mine, Bác sĩ đó mới có quyền xem hồ sơ của BN này ở Backend.

### 🚫 2.2 Bệnh nhân Thu hồi quyền
1.  **Giao diện:** Hiện danh sách các ví đang có quyền (`GET /v1/access-control/my-grants`).
2.  **Thao tác:** Bấm nút "Thu hồi" (Revoke) -> Ký MetaMask -> Gọi Confirm.
3.  **Hậu quả:** Bác sĩ sẽ mất quyền truy cập ngay lập tức (Lỗi 403 khi gọi API).

---

## 🚩 QUY TẮC HIỂN THỊ NÚT BẤM (DÀNH CHO DEV FRONTEND)

Dựa vào trường `status` trả về từ API, hãy lập trình logic hiển thị như sau:

| Trạng thái (On-chain) | Bệnh nhân thấy nút | Bác sĩ thấy nút | Lab Tech thấy nút |
| :--- | :--- | :--- | :--- |
| `ORDERED` (0) | ✅ Đồng ý (Consent) | ❌ (Chờ BN) | ❌ |
| `CONSENTED` (1) | ❌ (Chờ Lab) | ❌ | ✅ Tiếp nhận (Receive) |
| `IN_PROGRESS` (2) | ❌ | ❌ | ✅ Trả kết quả (Post Result) |
| `RESULT_POSTED` (3) | ❌ | ✅ Chẩn đoán (Interpret) | ❌ (Đã xong) |
| `DOCTOR_REVIEWED` (4) | ❌ | ✅ Hoàn tất (Complete) | ❌ |
| `COMPLETE` (5) | ❌ (Hồ sơ đã đóng) | ❌ | ❌ |

---

## ⚠️ CÁC LỖI THƯỜNG GẶP VÀ CÁCH XỬ LÝ

1.  **Lỗi "User is not ACTIVE":**
    - **Nguyên nhân:** Tài khoản đang ở trạng thái `PENDING` (chờ Admin duyệt).
    - **Xử lý:** Hiển thị Overlay chặn màn hình: *"Tài khoản của bạn đang chờ phê duyệt, vui lòng quay lại sau."*

2.  **Lỗi "Access Denied" (403):**
    - **Nguyên nhân:** Bác sĩ cố xem hồ sơ khi chưa được BN cấp quyền On-chain.
    - **Xử lý:** Hiện nút "Yêu cầu quyền truy cập" (gửi thông báo cho BN).

3.  **Lỗi "Execution Reverted" trên MetaMask:**
    - **Nguyên nhân:** Người dùng dùng sai ví (VD: BN lấy ví Bác sĩ để ký Consent).
    - **Xử lý:** Nhắc người dùng kiểm tra lại địa chỉ ví đang chọn trong MetaMask.

---
**Tip chuyên nghiệp:** Luôn dùng `try...catch` khi gọi `window.ethereum.request`. Nếu người dùng bấm "Cancel" trên MetaMask (lỗi code 4001), hãy tắt trạng thái Loading và cho phép họ bấm lại, đừng treo giao diện.
