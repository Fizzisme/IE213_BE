# ĐẠI ĐẶC TẢ VẬN HÀNH HỆ THỐNG Y TẾ SỐ HÓA WEB3 & AI (THE ULTIMATE GUIDE)

Tài liệu này cung cấp cái nhìn toàn diện 360 độ về hệ thống, từ kiến trúc API, logic Smart Contract đến kịch bản vận hành thực tế lâm sàng.

---

## 1. CÁC TÁC NHÂN VÀ KHẢ NĂNG (PERSONAS & CAPABILITIES)

Hệ thống được thiết kế dựa trên sự phân quyền tuyệt đối giữa 4 vai trò chính:

1.  **Bệnh nhân (Patient):**
    *   Tự quản lý ví điện tử cá nhân.
    *   Đặt lịch khám và chọn bác sĩ.
    *   Cấp/Thu hồi quyền truy cập hồ sơ trực tiếp trên Blockchain.
    *   Kiểm tra tính toàn vẹn của bệnh án (Chống giả mạo).
2.  **Bác sĩ (Doctor):**
    *   Xem danh sách lịch khám và tiếp nhận bệnh nhân.
    *   Tạo hồ sơ bệnh án ban đầu (Khám lâm sàng).
    *   Xem kết quả xét nghiệm và phân tích từ AI.
    *   Chốt chẩn đoán cuối cùng và đóng vĩnh viễn hồ sơ trên chuỗi.
3.  **Kỹ thuật viên (Lab Tech):**
    *   Tiếp nhận mẫu bệnh phẩm dựa trên yêu cầu từ Bác sĩ.
    *   Nhập các chỉ số cận lâm sàng thô.
    *   Ký xác nhận dữ liệu xét nghiệm lên Blockchain.
4.  **Quản trị viên (Admin):**
    *   Duyệt người dùng và gán vai trò On-chain.
    *   Quản lý danh mục dịch vụ y tế.
    *   Giám sát nhật ký kiểm toán (Audit Trail) hệ thống.

---

## 2. KỊCH BẢN KHÁM CHỮA BỆNH THỰC TẾ (END-TO-END WORKFLOW)

### Giai đoạn 1: Thiết lập Danh tính và Đăng nhập bảo mật
Hệ thống sử dụng mật mã học đường cong Elliptic để thay thế mật khẩu truyền thống.

*   **Bước 1: Đăng ký tài khoản (Off-chain)**
    *   **API:** `POST /v1/auth/register`
    *   **Dữ liệu:** Tên, Email, Năm sinh, Vai trò.
*   **Bước 2: Ký xác thực định danh (Gasless Onboarding)**
    *   Bệnh nhân dùng MetaMask ký chuỗi: `"REGISTER_ZUNI_PATIENT"`.
    *   **API:** `POST /v1/admins/users/:id/verify-onboarding`
    *   **Hành động:** Admin lấy chữ ký đó nộp lên hàm `registerPatientGasless` của **IdentityManager.sol**. Phí Gas do Admin trả. Bệnh nhân chính thức có tên trên Blockchain.
*   **Bước 3: Đăng nhập bằng chữ ký ví**
    *   **API 1:** `POST /v1/auth/login-by-wallet` ➡️ Nhận `nonce` (số dùng một lần).
    *   Người dùng ký `nonce`.
    *   **API 2:** `POST /v1/auth/login-by-wallet` ➡️ Gửi chữ ký ➡️ Nhận JWT Token.

### Giai đoạn 2: Đặt lịch và Cấp quyền (1-Transaction UX)
Giải quyết bài toán trải nghiệm người dùng Web3 phức tạp.

*   **Bước 4: Tạo lịch hẹn**
    *   **API:** `POST /v1/patients/appointments` (Body: `{ doctorId, serviceId, date }`).
    *   **Phản hồi:** Trả về `doctorWallet` của bác sĩ được chọn.
*   **Bước 5: Cấp quyền xem hồ sơ (On-chain)**
    *   Frontend bật MetaMask: Gọi hàm `grantAccess(doctorWallet, 24h)` của **DynamicAccessControl.sol**.
    *   **API:** `POST /v1/patients/appointments/:id/verify-grant-access` (Body: `{ txHash }`).
    *   **Kết quả:** Lịch hẹn chuyển sang `CONFIRMED`. Bác sĩ đã có chìa khóa mở hồ sơ của bệnh nhân trong 24h tới.

### Giai đoạn 3: Khám lâm sàng và Khởi tạo Bệnh án
Bác sĩ bắt đầu vòng đời của một hồ sơ y tế.

*   **Bước 6: Khám và Tạo hồ sơ**
    *   Bác sĩ gọi **API:** `POST /v1/doctors/patients/:patientId/medical-records` (Body: `{ type: "DIABETES_TEST", note: "Triệu chứng khát nước..." }`).
    *   **Phản hồi:** Trả về `recordHash`.
*   **Bước 7: Neo hồ sơ lên chuỗi (On-chain)**
    *   Bác sĩ ký MetaMask gọi hàm `createRecord` của **MedicalLedger.sol**.
    *   **API:** `POST /v1/doctors/medical-records/:id/verify-tx` ➡️ Lưu `createTxHash`. Trạng thái: `CREATED`.

### Giai đoạn 4: Xét nghiệm máu và Sức mạnh của AI
Dữ liệu thô được minh chứng bởi AI và khóa bởi Blockchain.

*   **Bước 8: Nhập kết quả xét nghiệm**
    *   Lab Tech gọi **API:** `POST /v1/lab-techs/medical-records/:id/test-results` (Body: `{ rawData: { glucose: 150, ... } }`).
    *   **Xử lý tại Backend:** Dữ liệu được đẩy qua **AI Model**. AI trả về: "Rủi ro tiểu đường: 85%".
    *   **Phản hồi:** Trả về `resultHash` (đã bao gồm kết quả AI).
*   **Bước 9: Móc xích dữ liệu (Hash-Chaining)**
    *   Lab Tech ký MetaMask gọi hàm `appendTestResult`.
    *   **Logic On-chain:** `testResultHash = keccak256(recordHash + resultHash_mới)`.
    *   **API:** `POST /v1/lab-techs/test-results/:id/verify-tx` ➡️ Lưu `labTxHash`. Trạng thái: `HAS_RESULT`.

### Giai đoạn 5: Chẩn đoán và Đóng hồ sơ vĩnh viễn
Điểm cuối của quy trình y tế nghiêm ngặt.

*   **Bước 10: Chốt chẩn đoán (Strict Flow)**
    *   Bác sĩ gọi **API:** `PATCH /v1/doctors/medical-records/:id/diagnosis` (Body: `{ diagnosis: "Tiểu đường Tuýp 2", note: "Điều trị bằng Insulin" }`).
    *   **Ràng buộc:** Nếu chưa có kết quả AI/Lab ở Bước 9 ➡️ Hệ thống từ chối chẩn đoán.
*   **Bước 11: Khóa vĩnh viễn (On-chain)**
    *   Bác sĩ ký MetaMask gọi hàm `closeRecord`.
    *   **Logic On-chain:** `diagnosisHash = keccak256(testResultHash + diagnosisHash_mới)`.
    *   **API:** `POST /v1/doctors/medical-records/:id/verify-tx` ➡️ Lưu `diagnosisTxHash`. Trạng thái: `COMPLETE`.

---

## 3. CÁC TÍNH NĂNG BẢO VỆ DỮ LIỆU ĐỘC QUYỀN

### 3.1 Kiểm tra tính toàn vẹn (Integrity Check)
Bệnh nhân có thể nhấn nút "Kiểm tra sự thật" bất cứ lúc nào.
*   **API:** `GET /v1/doctors/medical-records/:id/verify`.
*   **Logic:** Backend lấy dữ liệu MongoDB ➡️ Băm lại thành mã Hash hiện tại ➡️ Gọi Blockchain so sánh. Nếu sai lệch 1 dấu phẩy ➡️ Báo động dữ liệu bị hack.

### 3.2 Thu hồi quyền tức thì (Privacy Revoke)
Nếu bệnh nhân muốn kết thúc quyền xem của bác sĩ sớm hơn 24h.
*   **API:** `PATCH /v1/patients/appointments/:id/cancel`.
*   **Blockchain:** Gọi hàm `revokeAccess` trên ví của Bệnh nhân.

---

## 4. DANH MỤC API CHI TIẾT (API REFERENCE)

| Nhóm | Method | Path | Mục đích |
| :--- | :--- | :--- | :--- |
| **Auth** | POST | `/auth/register` | Đăng ký User (MongoDB) |
| | POST | `/auth/login-by-wallet` | Đăng nhập bằng chữ ký MetaMask |
| **Patient**| POST | `/patients/appointments` | Đặt lịch & Lấy ví Bác sĩ để Grant Access |
| | PATCH | `/patients/appointments/:id/cancel` | Hủy lịch & Lấy metadata để Revoke Access |
| | GET | `/patients/me` | Lấy thông tin ví và hồ sơ bản thân |
| **Doctor** | GET | `/doctors/appointments` | Xem danh sách bệnh nhân đã đặt lịch |
| | POST | `/doctors/patients/:patientId/medical-records` | Khởi tạo bệnh án mới |
| | PATCH | `/doctors/medical-records/:id/diagnosis` | Chốt bệnh án & Khóa Blockchain |
| | GET | `/doctors/medical-records/:id/verify` | Kiểm tra tính toàn vẹn (Hậu kiểm) |
| **Lab** | POST | `/lab-techs/medical-records/:id/test-results` | Nhập chỉ số xét nghiệm & Gọi AI phân tích |
| | POST | `/lab-techs/test-results/:id/verify-tx` | Xác minh giao dịch Lab On-chain |
| **Admin** | POST | `/admins/users/:id/verify-onboarding` | Đưa người dùng lên Blockchain |
| | PATCH | `/admins/users/:id/approve` | Duyệt hồ sơ Off-chain |

---
*Tài liệu này xác nhận một quy trình y tế khép kín, nơi dữ liệu được bảo vệ bởi toán học (Hash-Chaining), thực thi bởi Smart Contract và gia tăng giá trị bởi Trí tuệ nhân tạo (AI).*
