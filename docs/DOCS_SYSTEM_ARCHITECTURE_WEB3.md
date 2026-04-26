# TÀI LIỆU ĐẶC TẢ KỸ THUẬT HỆ THỐNG Y TẾ PHÂN TÁN (WEB3 HEALTHCARE MASTER DOC)

## 1. TẦM NHÌN VÀ KIẾN TRÚC TỔNG THỂ (THE BIG PICTURE)

Hệ thống được thiết kế để giải quyết bài toán "Lòng tin" trong ngành y tế: Làm sao để bệnh nhân tin rằng hồ sơ của mình không bị sửa đổi? Làm sao để bác sĩ tin rằng kết quả xét nghiệm là thực?

### 1.1 Mô hình Hybrid Storage (Lưu trữ hỗn hợp)
Thay vì lưu toàn bộ dữ liệu lên Blockchain (vốn cực kỳ đắt đỏ và chậm), hệ thống sử dụng:
*   **Off-chain (MongoDB):** Lưu trữ dữ liệu thô (Raw Data) như tên tuổi, triệu chứng, chỉ số xét nghiệm dưới dạng JSON. Đảm bảo tốc độ truy xuất mil giây.
*   **On-chain (Blockchain - EVM):** Lưu trữ trạng thái định danh, trạng thái quyền truy cập và "Dấu vân tay số" (Mã Hash). Blockchain đóng vai trò là **"Sổ cái sự thật" (Source of Truth)** để đối chiếu.

### 1.2 Stack Công nghệ
*   **Smart Contracts:** Solidity (^0.8.20), OpenZeppelin (ECDSA, MessageHashUtils).
*   **Backend:** Node.js, Express, Mongoose.
*   **Blockchain Provider:** Ethers.js / Hardhat.
*   **AI Service:** Python (Dự đoán rủi ro tiểu đường).

---

## 2. PHÂN TÍCH CHUYÊN SÂU 3 TRỤ CỘT SMART CONTRACTS

### 2.1 IdentityManager.sol - Cổng định danh và Gasless Onboarding
Hợp đồng này quản lý 5 vai trò (Roles) thông qua kiểu dữ liệu `Enum`: `NONE, PATIENT, DOCTOR, LAB_TECH, ADMIN`.

*   **Tính năng Gasless (EIP-712 Concept):** Đây là điểm sáng kỹ thuật. Thông thường, để ghi dữ liệu lên Blockchain, người dùng phải có ETH trong ví. Với Bệnh nhân, chúng ta áp dụng cơ chế:
    1.  Bệnh nhân ký một thông điệp: `"REGISTER_ZUNI_PATIENT"`.
    2.  Hàm `registerPatientGasless` sử dụng `ECDSA.recover` để phục hồi địa chỉ ví từ chữ ký.
    3.  Admin là người thực thi giao dịch này và trả phí Gas thay cho bệnh nhân.
    ➡️ **Kết quả:** Bệnh nhân gia nhập mạng lưới Blockchain với chi phí bằng 0.

### 2.2 DynamicAccessControl.sol - Kiểm soát quyền truy cập theo thời gian
Hợp đồng này không sử dụng các cờ Boolean (`true/false`) đơn giản mà sử dụng cấu trúc `AccessToken`:
```solidity
struct AccessToken {
    bool isGranted;
    uint256 expiresAt;
}
```
*   **Lazy Evaluation (Định giá lười):** Quyền truy cập được xác định bằng biểu thức: `token.isGranted && block.timestamp <= token.expiresAt`. 
*   **Ưu điểm:** Hệ thống không bao giờ cần chạy một "Cron job" trên Blockchain để xóa quyền khi hết hạn (vốn rất tốn kém). Smart Contract chỉ cần so sánh thời gian thực tại thời điểm truy cập.

### 2.3 MedicalLedger.sol - Móc xích dữ liệu (Hash-Chaining)
Đây là nơi thực thi logic bảo mật dữ liệu cao nhất. Hệ thống không lưu mã băm rời rạc mà lưu theo dạng mắt xích.

1.  **Giai đoạn Create:** Lưu `recordHash`.
2.  **Giai đoạn Lab:** Lưu `testResultHash = keccak256(abi.encodePacked(r.recordHash, _resultHash_mới))`.
3.  **Giai đoạn Diagnosis:** Lưu `diagnosisHash = keccak256(abi.encodePacked(r.testResultHash, _diagnosisHash_mới))`.

Toán học đằng sau: Nếu một phần tử ở mắt xích đầu tiên bị đổi, mã băm đầu ra của nó sẽ đổi, dẫn đến mắt xích thứ 2 (vốn dùng đầu ra mắt xích 1 làm đầu vào) cũng đổi, và cứ thế dây chuyền đến mắt xích cuối. **Chỉ cần Blockchain khớp mã Hash cuối cùng, nghĩa là toàn bộ lịch sử phía trước đều sạch.**

---

## 3. LUỒNG NGHIỆP VỤ HỆ THỐNG (SYSTEM WORKFLOWS)

### 3.1 Luồng Đặt lịch và Cấp quyền (1-Transaction UX)
Đây là luồng đã được tối ưu hóa để giảm bớt thao tác cho Bệnh nhân:
*   **Bước 1:** Bệnh nhân chọn Bác sĩ và ngày giờ khám.
*   **Bước 2:** API `/appointments` trả về thông tin lịch hẹn và `doctorWalletAddress`.
*   **Bước 3:** Frontend lập tức gọi hàm `grantAccess` trên Blockchain. Bệnh nhân chỉ cần nhấn "Confirm" trên MetaMask 1 lần duy nhất.
*   **Bước 4:** Backend xác minh giao dịch và gán bác sĩ vào lịch.

### 3.2 Luồng Khám bệnh và Chẩn đoán Nghiêm ngặt (Strict Clinical Flow)
Hệ thống ép buộc quy trình y tế chính quy để bảo vệ tính logic trên Blockchain:

1.  **Bác sĩ Khám ban đầu:** Tạo hồ sơ (`CREATED`), đẩy `recordHash` lên chuỗi.
2.  **Kỹ thuật viên thực hiện xét nghiệm:**
    *   Hệ thống Backend kết nối với AI để phân tích dữ liệu lâm sàng.
    *   Lab Tech đẩy kết quả vào DB. Trạng thái chuyển thành `HAS_RESULT`.
    *   Giao dịch `appendTestResult` được thực thi, khóa mắt xích dữ liệu thứ 2.
3.  **Bác sĩ Chẩn đoán cuối cùng:**
    *   **Ràng buộc:** Bác sĩ KHÔNG THỂ chẩn đoán nếu hồ sơ chưa có `HAS_RESULT` (Chống lỗi logic State Deadlock).
    *   Bác sĩ chốt bệnh và thuốc. Trạng thái chuyển thành `DIAGNOSED`.
    *   Bác sĩ ký giao dịch `closeRecord`, khóa mắt xích cuối cùng và chuyển trạng thái hồ sơ vĩnh viễn thành `COMPLETE`.

### 3.3 Luồng Hủy lịch và Bảo mật (Privacy Flow)
*   Khi Bệnh nhân hủy lịch khám, API trả về metadata để Frontend kích hoạt MetaMask gọi hàm `revokeAccess`.
*   Việc thu hồi quyền đảm bảo bác sĩ không còn tư cách xem lại hồ sơ cũ của bệnh nhân trên Blockchain, tuân thủ nghiêm ngặt quyền riêng tư dữ liệu y tế.

---

## 4. CƠ CHẾ KIỂM TRA TÍNH TOÀN VẸN (INTEGRITY VERIFICATION)

Hệ thống cung cấp một công cụ "So khớp sự thật" cực kỳ mạnh mẽ qua API `verifyIntegrity`:

*   **Đầu vào:** Một ID hồ sơ bệnh án.
*   **Xử lý:**
    1.  Backend lấy dữ liệu văn bản từ MongoDB.
    2.  Tính toán mã băm SHA-256 dựa trên dữ liệu đó.
    3.  Gọi hàm `records(mongoId)` trên Smart Contract để lấy mã Hash "Sự thật" đã lưu trước đó.
    4.  So sánh hai mã Hash.
*   **Phát hiện gian lận:** Nếu Admin hệ thống lén lút sửa chỉ số đường huyết từ "Cao" thành "Bình thường" trong MongoDB để gian lận bảo hiểm, mã Hash tính toán lại sẽ không khớp với Blockchain. Hệ thống sẽ báo đỏ và chỉ ra chính xác giai đoạn nào dữ liệu đã bị sửa đổi.

---

## 5. TỔNG KẾT TÍNH NĂNG ĐỘC ĐÁO
1.  **Chống giả mạo 3 lớp:** Hash-Chaining nối liền từ lúc khám đến lúc chốt bệnh.
2.  **Tự động hóa hết hạn:** Quyền truy cập tự biến mất sau 24h mà không tốn phí Gas.
3.  **Hợp nhất UX:** Đặt lịch đi kèm cấp quyền, Hủy lịch đi kèm thu hồi.
4.  **Audit Trail tập trung:** Mọi `txHash` của cả Bác sĩ và Lab Tech đều được quy về một mối trong bảng Hồ sơ bệnh án.

---
*Tài liệu này được soạn thảo để đảm bảo mọi bên liên quan (Bệnh nhân, Bác sĩ, Quản trị viên) đều nắm rõ quy trình vận hành và sự an toàn của dữ liệu y tế trên nền tảng Web3.*
