# ĐẶC TẢ KỸ THUẬT CHUYÊN SÂU HỆ THỐNG Y TẾ WEB3 (TECHNICAL DEEP DIVE)

## 1. MÔ HÌNH DỮ LIỆU VÀ SỰ ĐỒNG BỘ CẤU TRÚC (DATA MAPPING)

Hệ thống duy trì sự song phẳng tuyệt đối giữa **Thực thể Off-chain (MongoDB)** và **Bằng chứng On-chain (Blockchain)**.

### 1.1 Quản lý Định danh (Identity Mapping)
*   **MongoDB (`users` collection):** Lưu trữ thông tin định danh (`email`, `passwordHash`, `role`). Trường quan trọng nhất là `authProviders` chứa `walletAddress`.
*   **Smart Contract (`IdentityManager.sol`):**
    ```solidity
    struct Account {
        Role role;           // Enum: 0:NONE, 1:PATIENT, 2:DOCTOR, 3:LAB_TECH, 4:ADMIN
        bool isActive;       // Trạng thái hoạt động (cho phép Admin khóa tài khoản)
        uint256 registeredAt; // Timestamp Unix thời điểm ghi nhận On-chain
    }
    ```
*   **Cơ chế liên kết:** Khi Admin gọi `verifyOnboarding`, địa chỉ ví trong MongoDB được gửi lên chuỗi. Mọi giao dịch sau đó từ ví này sẽ được Contract kiểm tra `accounts[msg.sender].role`.

### 1.2 Móc xích Hồ sơ bệnh án (Record Chaining)
*   **MongoDB (`medical_records` collection):** Lưu `note`, `type`, `status`.
*   **Smart Contract (`MedicalLedger.sol`):** Lưu `Record` struct với khóa chính là `mongoId` (String).
*   **Logic băm mắt xích (Chaining Logic):**
    1.  **Hạt nhân (Base):** `recordHash` = `sha256(type + note + patientId)`.
    2.  **Mắt xích 2:** `testResultHash` = `keccak256(recordHash + resultHash_mới)`. Trong đó `resultHash_mới` bao gồm cả kết quả AI (`aiAnalysis`).
    3.  **Mắt xích 3 (Đóng):** `diagnosisHash` = `keccak256(testResultHash + diagnosisHash_mới)`.

---

## 2. PHÂN TÍCH LUỒNG GIAO DỊCH PHỨC HỢP (TRANSACTION PIPELINES)

### 2.1 Luồng Gasless Onboarding (Đăng ký không phí Gas)
Đây là quy trình bảo mật sử dụng mật mã học đường cong Elliptic (ECDSA):
1.  **Frontend:** Bệnh nhân ký lời nhắn `"REGISTER_ZUNI_PATIENT"` bằng Private Key cục bộ (không tốn Gas).
2.  **Backend:** Nhận địa chỉ ví và chữ ký (`signature`).
3.  **On-chain:** Admin gọi `registerPatientGasless(patientAddress, signature)`.
4.  **Contract Logic:**
    *   Tái tạo Hash lời nhắn: `keccak256("REGISTER_ZUNI_PATIENT")`.
    *   Phục hồi người ký: `ecrecover(messageHash, signature)`.
    *   So sánh: Nếu `signer == patientAddress` ➡️ Xác thực chính chủ ➡️ Gán Role PATIENT.

### 2.2 Luồng "1-Transaction UX" (Appointment Integration)
Hệ thống giải quyết bài toán trải nghiệm người dùng bằng cách gộp luồng nghiệp vụ:
1.  **Request:** Bệnh nhân gửi yêu cầu đặt lịch kèm `doctorId`.
2.  **Service Processing:**
    *   Validate ngày giờ (không được ở quá khứ).
    *   Truy vấn ví của Bác sĩ từ DB.
    *   Lưu lịch hẹn ở trạng thái `PENDING`.
3.  **Response Object:**
    ```json
    {
      "appointmentId": "...",
      "blockchain": {
        "action": "GRANT_ACCESS",
        "doctorWallet": "0xABC...",
        "durationHours": 24
      }
    }
    ```
4.  **Frontend Action:** Lập tức gọi `accessControl.grantAccess(doctorWallet, 24)`.

---

## 3. CƠ CHẾ BẢO MẬT VÀ TOÀN VẸN (SECURITY ARCHITECTURE)

### 3.1 Kiểm soát Truy cập Động (Dynamic RBAC)
Khác với RBAC tĩnh, hệ thống sử dụng **Time-bound Consent** (Sự đồng thuận có thời hạn):
*   Khi Bác sĩ truy cập chi tiết hồ sơ (`getDetail`), Backend thực hiện một lệnh `Call` (không tốn gas) đến hàm `canAccess` trên Blockchain.
*   Nếu kết quả trả về là `false` (do hết hạn 24h hoặc chưa được cấp), Backend sẽ ném lỗi `403 Forbidden` ngay lập tức, dù cho Bác sĩ đó có ID hợp lệ trong Database.

### 3.2 Quy trình "Strict Flow" (Cưỡng chế Trạng thái)
Để bảo vệ tính toàn vẹn của chuỗi mã băm, Backend đóng vai trò là người gác cổng:
*   Hàm `diagnosis` (Chẩn đoán) thực hiện kiểm tra: `if (medicalRecord.status !== 'HAS_RESULT')`.
*   Điều này đảm bảo mã băm đầu vào cho mắt xích thứ 3 (`testResultHash`) chắc chắn đã tồn tại trên Blockchain. Nếu không, giao dịch `closeRecord` sẽ bị Revert, gây lãng phí Gas cho Bác sĩ.

### 3.3 Thuật toán Hậu kiểm Integrity (Audit Algorithm)
Hàm `verifyIntegrity` là sự kết hợp giữa xử lý chuỗi Off-chain và xác thực On-chain:
1.  **Bước 1:** Trích xuất dữ liệu thô từ MongoDB theo đúng Schema lúc khởi tạo.
2.  **Bước 2:** Sử dụng hàm `generateDataHash` (thực chất là `crypto.createHash('sha256')`) để tạo mã vân tay số hiện tại.
3.  **Bước 3:** Gọi Smart Contract hàm `verifyIntegrity(id, currentHash, type)`.
4.  **Bước 4:** Contract thực hiện phép tính `keccak256` gộp (nếu type > 0) và so sánh trực tiếp trên EVM.
➡️ **Ý nghĩa:** Đây là cơ chế tự động phát hiện mọi can thiệp bất hợp pháp vào Database cấp độ từng bit dữ liệu.

---

## 4. TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI & BLOCKCHAIN CONVERGENCE)

Quy trình xét nghiệm tiểu đường là một ví dụ điển hình của việc kết hợp AI và Blockchain:
1.  **Dữ liệu thô:** 8 chỉ số sức khỏe được Lab Tech nhập vào.
2.  **AI Inference:** Backend gửi dữ liệu đến Flask AI Service ➡️ Nhận kết quả rủi ro (%) và dự đoán (0/1).
3.  **Data Binding:** Thông tin AI (`aiAnalysis`) được nhúng trực tiếp vào object dữ liệu xét nghiệm trước khi băm.
4.  **Blockchain Anchoring:** Mã Hash cuối cùng được lưu lên chuỗi bao gồm cả "Ý kiến của AI". 
➡️ Điều này giúp ngăn chặn việc sửa đổi kết quả dự đoán của máy sau khi đã có ý kiến tư vấn y khoa.

---

## 5. QUY ĐỊNH LƯU TRỮ TRÊN CHUỖI (ON-CHAIN STORAGE OPTIMIZATION)

Hệ thống áp dụng các kỹ thuật tối ưu Gas:
*   **Mapping thay vì Array:** Truy xuất thông tin hồ sơ theo `mongoId` với độ phức tạp `O(1)`.
*   **Indexed Events:** Các sự kiện `RecordUpdated` được đánh index giúp Frontend và Backend (Listener) tìm kiếm lịch sử giao dịch nhanh chóng mà không cần quét toàn bộ Block.
*   **String to Bytes32:** Mọi mã Hash được lưu dưới dạng `bytes32` (định dạng cố định) để giảm thiểu tối đa chi phí lưu trữ trên Ethereum.

---
*Tài liệu này là hướng dẫn chính thức cho việc bảo trì và nâng cấp hệ thống IE213 - Medical Blockchain.*
