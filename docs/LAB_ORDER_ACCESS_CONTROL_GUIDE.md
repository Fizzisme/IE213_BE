# 🧪 Hướng dẫn Nghiệp vụ: Lab Order & Access Control
## Quy trình phối hợp Frontend — Backend — Blockchain

Tài liệu này hướng dẫn chi tiết cách triển khai giao diện cho hai luồng quan trọng nhất của hệ thống.

---

## 1. LUỒNG QUẢN LÝ XÉT NGHIỆM (LAB ORDER FLOW)

Luồng này đi qua 4 vai trò và yêu cầu sự chính xác tuyệt đối về trạng thái (Status).

### Bước 1: Bác sĩ tạo Chỉ định (Create Order)
- **Frontend:** Bác sĩ chọn Bệnh nhân -> Chọn Lab Tech -> Chọn danh mục xét nghiệm -> Bấm "Gửi yêu cầu".
- **API Prepare:** `POST /v1/lab-orders`
- **Blockchain:** Bác sĩ ký giao dịch `addRecord(...)` qua MetaMask.
- **API Confirm:** `POST /v1/lab-orders/confirm` với `txHash`.

### Bước 2: Bệnh nhân Đồng ý (Patient Consent)
- **Frontend:** Bệnh nhân vào danh sách "Yêu cầu chờ xử lý" -> Thấy yêu cầu từ Bác sĩ -> Bấm "Đồng ý".
- **API Prepare:** `PATCH /v1/lab-orders/:id/consent`
- **Blockchain:** Bệnh nhân ký giao dịch `updateRecordStatus(..., CONSENTED)` qua MetaMask.
- **API Confirm:** `PATCH /v1/lab-orders/:id/consent/confirm`.

### Bước 3: Kỹ thuật viên trả Kết quả (Post Lab Result)
- **Frontend:** Lab Tech nhận mẫu -> Nhập các chỉ số kết quả -> Bấm "Trả kết quả".
- **API Prepare:** `PATCH /v1/lab-orders/:id/post-result`
- **Blockchain:** Lab Tech ký giao dịch `postLabResult(...)` qua MetaMask. **Lưu ý:** Chỉ đúng ví Lab Tech được phân công ở Bước 1 mới ký được.
- **API Confirm:** `PATCH /v1/lab-orders/:id/post-result/confirm`.

### Bước 4: Bác sĩ chẩn đoán & Đóng hồ sơ (Interpretation & Complete)
- **Frontend:** Bác sĩ xem kết quả Lab -> Nhập lời khuyên/chẩn đoán -> Bấm "Hoàn tất".
- **Prepare & Blockchain:** Bác sĩ ký 2 giao dịch (hoặc gộp tùy logic) gọi hàm `addClinicalInterpretation` và `updateRecordStatus(..., COMPLETE)`.
- **API Confirm:** Gọi các endpoint `/interpretation/confirm` và `/complete/confirm`.

---

## 2. LUỒNG KIỂM SOÁT QUYỀN TRUY CẬP (ACCESS CONTROL)

Bệnh nhân đóng vai trò "người chủ gia đình", cấp chìa khóa cho Bác sĩ vào xem nhà (Hồ sơ).

### A. Cấp quyền (Grant Access)
- **Dữ liệu cần:** `accessorAddress` (Ví Bác sĩ), `level` (Quyền thường/Nhạy cảm), `expiresAt` (Thời hạn).
- **API Prepare:** `POST /v1/access-control/grant`
- **Blockchain:** Bệnh nhân ký hàm `grantAccess(...)`.
- **API Confirm:** `POST /v1/access-control/grant/confirm`.

### B. Thu hồi quyền (Revoke Access)
- **Frontend:** Bệnh nhân thấy danh sách Bác sĩ đang có quyền -> Bấm "Thu hồi".
- **API Prepare:** `POST /v1/access-control/revoke`
- **Blockchain:** Bệnh nhân ký hàm `revokeAccess(...)`.
- **API Confirm:** `POST /v1/access-control/revoke/confirm`.

---

## 🛠 KIỂM TRA LOGIC CHO FRONTEND (Checklist)

1.  **Chặn nút (Button Disabling):**
    - Nếu trạng thái hồ sơ là `ORDERED`, chỉ hiện nút "Đồng ý" cho Bệnh nhân.
    - Nếu trạng thái hồ sơ là `IN_PROGRESS`, chỉ hiện nút "Nhập kết quả" cho Lab Tech.
    - Đừng để người dùng bấm các nút sai luồng nghiệp vụ.

2.  **Địa chỉ ví (Address Consistency):**
    - Khi Bác sĩ tạo Order, Frontend phải lấy đúng `walletAddress` của Lab Tech (thường lấy từ profile của Lab Tech trong danh sách chọn).
    - Nếu địa chỉ ví truyền vào Bước Prepare sai, MetaMask vẫn cho ký nhưng Bước Confirm ở Backend sẽ báo lỗi ngay lập tức.

3.  **Mức độ nhạy cảm (Access Levels):**
    - Đối với các xét nghiệm HIV, Frontend phải gợi ý Bệnh nhân cấp quyền ở mức `SENSITIVE` (Level 3).
    - Nếu Bác sĩ chỉ có quyền `FULL` (Level 2) mà cố truy cập xét nghiệm HIV, Smart Contract sẽ Revert giao dịch.

4.  **Xác minh (Integrity Verify):**
    - Ở màn hình chi tiết kết quả, luôn có nút "Verify on Blockchain". 
    - Frontend chỉ cần gọi `POST /v1/patient-records/verify`. Nếu kết quả trả về `isValid: false`, hãy hiện cảnh báo đỏ: *"Dữ liệu có dấu hiệu bị can thiệp!"*

---
**Hỗ trợ kỹ thuật:** Nếu team Frontend gặp lỗi `Execution Reverted` trên MetaMask, hãy kiểm tra xem ví đang ký có đúng là ví của người sở hữu vai trò đó không (Ví dụ: Chỉ bệnh nhân mới ký được Consent).
