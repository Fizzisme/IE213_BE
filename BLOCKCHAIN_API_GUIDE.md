# Hướng dẫn sử dụng EHR Blockchain API (Web3 Integration)

Tài liệu này hướng dẫn cách sử dụng các API mới tích hợp Blockchain trong hệ thống EHR. Toàn bộ hệ thống tuân thủ kiến trúc **Phi tập trung (Decentralized)**: Backend không giữ Private Key, mọi giao dịch được ký bởi người dùng qua MetaMask.

## 1. Nguyên lý chung: Luồng Prepare - Confirm

Hầu hết các tác vụ ghi dữ liệu lên Blockchain sẽ đi qua 2 bước:
1.  **Bước 1 (Prepare):** Frontend gọi API Backend để lưu dữ liệu nháp. Backend trả về mã **Hash** (vân tay số) của dữ liệu đó.
2.  **Bước 2 (Signing):** Frontend dùng MetaMask ký giao dịch chứa mã Hash đó lên Smart Contract.
3.  **Bước 3 (Confirm):** Frontend gửi `txHash` (mã giao dịch) về API xác minh của Backend. Backend đợi giao dịch thành công và chốt trạng thái `isSynced: true`.

---

## 2. Dành cho Bệnh nhân (Patient)

### A. Đăng ký tài khoản (Gasless Onboarding)
*   **API:** `POST /v1/auth/login/wallet`
*   **Luồng:**
    1.  Bệnh nhân kết nối ví, ký thông điệp `"REGISTER_ZUNI_PATIENT"` (Free gas).
    2.  Gửi `walletAddress`, `signature`, và `registrationSignature` (chữ ký bước 1) lên API.
    3.  Backend lưu chữ ký này để Admin nộp lên Blockchain sau.

### B. Cấp quyền cho Bác sĩ (Grant Access)
*   **API chuẩn bị:** `GET /v1/patients/appointments/:id/prepare-grant-access`
*   **Frontend thực hiện:**
    1.  Nhận `doctorWallet` và `durationHours` từ API.
    2.  Gọi hàm `grantAccess(doctorWallet, duration)` trên Smart Contract **DynamicAccessControl**.
    3.  Lấy `txHash` từ MetaMask.
*   **API xác nhận:** `POST /v1/patients/appointments/:id/verify-grant-access`
    *   Body: `{ "txHash": "0x..." }`

---

## 3. Dành cho Bác sĩ (Doctor)

### A. Tạo hồ sơ bệnh án (Create Record)
*   **API tạo:** `POST /v1/doctors/patients/:patientId/medical-records`
*   **Frontend thực hiện:**
    1.  Nhận `recordHash` từ API.
    2.  Gọi hàm `createRecord(mongoId, patientWallet, recordHash)` trên Smart Contract **MedicalLedger**.
*   **API xác nhận:** `POST /v1/doctors/medical-records/:id/verify-tx`
    *   Body: `{ "txHash": "0x..." }`

### B. Chốt chẩn đoán (Close Record)
*   **API tạo:** `PATCH /v1/doctors/medical-records/:id/diagnosis`
*   **Frontend thực hiện:**
    1.  Nhận `diagnosisHash`.
    2.  Gọi hàm `closeRecord(mongoId, diagnosisHash)` trên Smart Contract **MedicalLedger**.
*   **API xác nhận:** (Dùng chung verify-tx của hồ sơ)

### C. Kiểm tra tính toàn vẹn (Integrity Check) - ĐIỂM ĂN TIỀN
*   **API:** `GET /v1/doctors/medical-records/:id/verify`
*   **Mô tả:** Backend sẽ băm lại dữ liệu hiện tại trong MongoDB và so sánh với mã Hash đã "đóng dấu" trên Blockchain. Trả về `isValid: true/false`.

---

## 4. Dành cho Kỹ thuật viên Lab (Lab Tech)

### Nhập kết quả xét nghiệm
*   **API tạo:** `POST /v1/lab-tech/medical-records/:id/test-results`
*   **Frontend thực hiện:**
    1.  Nhận `resultHash`.
    2.  Gọi hàm `appendTestResult(mongoId, resultHash)` trên Smart Contract **MedicalLedger**.
*   **API xác nhận:** `POST /v1/lab-tech/test-results/:id/verify-tx`
    *   Body: `{ "txHash": "0x..." }`

---

## 5. Dành cho Quản trị viên (Admin)

### Duyệt User & Đăng ký Blockchain
*   **API duyệt:** `PATCH /v1/admin/users/:id/approve`
*   **Frontend thực hiện:**
    1.  Nếu là Bác sĩ/Kỹ thuật viên: Gọi `registerStaff(wallet, role)` trên **IdentityManager**.
    2.  Nếu là Bệnh nhân (Gasless): Gọi `registerPatientGasless(patientWallet, signature)` trên **IdentityManager**.
*   **API xác nhận:** `POST /v1/admin/users/:id/verify-onboarding`
    *   Body: `{ "txHash": "0x..." }`

---

## 6. Lưu ý kỹ thuật cho Frontend
*   **Thư viện:** Khuyên dùng `ethers.js` (v6).
*   **Mạng lưới:** Sepolia Testnet.
*   **Địa chỉ Contract:** Lấy từ file `.env` của Backend.
*   **ABIs:** Backend đã cung cấp sẵn trong thư mục `src/blockchains/abis/`.
