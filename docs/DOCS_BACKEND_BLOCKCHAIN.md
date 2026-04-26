# HƯỚNG DẪN TÍCH HỢP BLOCKCHAIN CHO BACKEND

Tài liệu này mô tả các điểm chạm kỹ thuật giữa Node.js và Smart Contracts.

## 1. Kết nối (Provider & Contracts)
Hệ thống sử dụng `ethers.js` để giao tiếp với mạng Blockchain thông qua các file trong `src/blockchains/`:
*   `provider.js`: Cấu hình RPC URL và Private Key của Admin.
*   `contract.js`: Khởi tạo các instance của Smart Contract (`IdentityManager`, `DynamicAccessControl`, `MedicalLedger`).

## 2. Các luồng xử lý chính

### 2.1 Luồng Xác minh (Verify Transaction)
Tất cả các hành động ghi lên Blockchain đều tuân theo mô hình:
1.  **Frontend:** Ký giao dịch qua MetaMask ➡️ Nhận về `txHash`.
2.  **Backend:** Nhận `txHash` qua API `/verify-tx`. 
3.  **Xử lý:** Backend sử dụng `blockchainProvider.waitForTransaction(txHash)` để đợi giao dịch được đóng block thành công. Chỉ khi thành công mới cập nhật cờ `isSynced: true` trong Database.

### 2.2 Luồng Móc xích dữ liệu (Medical Record Life-cycle)
*   **Khi Tạo (`CREATED`):** Lưu `createTxHash`.
*   **Khi có Kết quả (`HAS_RESULT`):** Lưu `labTxHash` đồng thời vào cả bảng `TestResult` và `MedicalRecord`.
*   **Khi Chẩn đoán (`COMPLETE`):** Lưu `diagnosisTxHash` và ép buộc trạng thái về `COMPLETE` để đồng bộ với Smart Contract.

### 2.3 Luồng Cấp quyền (Access Control)
Backend đóng vai trò cung cấp "Nguyên liệu" cho Frontend ký:
*   API Đặt lịch: Trả về `doctorWallet` và `durationHours`.
*   API Hủy lịch: Trả về `doctorWallet` để thu hồi.

## 3. Hàm Hậu kiểm (Integrity Service)
Hàm `verifyIntegrity` trong `medicalRecord.service.js` thực hiện logic:
1.  Nhận `medicalRecordId`.
2.  Tự động kiểm tra trạng thái hiện tại.
3.  Lấy dữ liệu thô từ MongoDB ➡️ Băm SHA-256.
4.  Gọi hàm `verifyIntegrity` của Smart Contract (hàm View - Miễn phí Gas).
5.  Trả về kết quả so khớp cuối cùng.

## 4. Cấu hình bảo mật
*   **Private Key:** Luôn lưu trong biến môi trường `.env`, tuyệt đối không commit lên Git.
*   **Wallet Addresses:** Lưu trong `user.authProviders` mảng để linh hoạt thay đổi ví.
