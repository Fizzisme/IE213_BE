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

## 5. KẾT LUẬN (CONCLUSION)

### 5.1 Ưu điểm
*   **Bảo vệ danh tính người dùng ở mức độ cao:** Hệ thống áp dụng mô hình "Ví là Danh tính" thông qua hợp đồng `IdentityManager`. Thay vì lưu trữ các thông tin cá nhân nhạy cảm như email hay mật khẩu, danh tính người dùng được gắn liền với địa chỉ ví Ethereum. Việc sử dụng cơ chế **Gasless Onboarding** giúp bệnh nhân tham gia hệ thống mà không cần sở hữu ETH, đồng thời bảo đảm quyền ẩn danh tương đối khi tương tác với mạng lưới y tế.
*   **Xác thực tính toàn vẹn dữ liệu đa lớp (Hash-Chaining):** Cơ chế khóa hash ba lớp (`recordHash`, `testResultHash`, `diagnosisHash`) neo chặt dữ liệu tại từng giai đoạn của quy trình y tế lên Blockchain. Bất kỳ sự thay đổi nào đối với dữ liệu Off-chain trong MongoDB — dù chỉ một ký tự — đều bị phát hiện ngay lập tức thông qua hàm `verifyIntegrity`. Đây là bằng chứng kỹ thuật không thể chối cãi, bảo vệ cả bệnh nhân lẫn bác sĩ khỏi các tranh chấp về tính xác thực của hồ sơ.
*   **Trao quyền kiểm soát dữ liệu về tay bệnh nhân:** Thông qua hợp đồng `DynamicAccessControl`, bệnh nhân là người duy nhất có quyền quyết định bác sĩ nào được xem hồ sơ của mình. Đặc biệt, hệ thống đã tối ưu hóa luồng **1-Transaction UX**, cho phép cấp quyền ngay khi đặt lịch và thu hồi quyền ngay khi hủy lịch. Quyền này tự động hết hạn sau 24 giờ nhờ cơ chế **Lazy Evaluation** trên Blockchain, ngăn chặn việc rò rỉ dữ liệu dài hạn.
*   **Kiến trúc lai tối ưu hiệu năng và bảo mật:** Mô hình Hybrid On-chain/Off-chain cho phép hệ thống tận dụng tốc độ của MongoDB cho các thao tác đọc/ghi thông thường, trong khi Blockchain đảm nhận vai trò neo chứng thực cho các sự kiện quan trọng. Người dùng trải nghiệm tốc độ phản hồi nhanh nhưng vẫn được bảo đảm bởi tính bất biến của Web3.
*   **Nhật ký kiểm toán minh bạch và tập trung:** Mọi sự kiện từ lúc khám bệnh đến chẩn đoán đều được ghi lại dưới dạng Event On-chain. Backend đã được tối ưu để tập trung hóa toàn bộ lịch sử giao dịch (`createTxHash`, `labTxHash`, `diagnosisTxHash`) vào duy nhất một hồ sơ bệnh án, giúp việc truy vết "ai làm gì, lúc nào" trở nên minh bạch và dễ dàng kiểm toán.
*   **Phân quyền và ràng buộc trạng thái nghiêm ngặt (Strict Flow):** Hợp đồng `MedicalLedger` và logic Backend ép buộc hồ sơ phải đi đúng trình tự: `Khởi tạo -> Xét nghiệm -> Chẩn đoán`. Bác sĩ không thể chẩn đoán nếu chưa có kết quả từ Lab Tech, và chỉ bác sĩ khởi tạo hồ sơ mới có quyền đóng hồ sơ (`closeRecord`). Điều này loại bỏ hoàn toàn khả năng can thiệp chéo hoặc nhập sai quy trình.

### 5.2 Hạn chế
*   **Phụ thuộc vào tình trạng mạng Blockchain:** Các thao tác quan trọng như duyệt tài khoản hay chốt bệnh án đều yêu cầu giao dịch On-chain được xác nhận. Khi mạng Ethereum (Sepolia) gặp tải cao, những thao tác này có thể bị chậm hoặc gián đoạn.
*   **Rủi ro mất quyền truy cập vĩnh viễn:** Do hệ thống không sử dụng cơ chế khôi phục mật khẩu truyền thống, nếu bệnh nhân làm mất Private Key hoặc cụm từ khôi phục ví MetaMask, họ sẽ mất vĩnh viễn quyền truy cập vào hồ sơ sức khỏe của mình.
*   **Rào cản tiếp cận với người dùng phổ thông:** Người dùng vẫn cần biết cách cài đặt và sử dụng ví MetaMask cơ bản. Dù đã có Gasless Onboarding, việc ký xác nhận vẫn là một khái niệm mới mẻ với bệnh nhân lớn tuổi.
*   **Tính toàn vẹn phụ thuộc vào khâu nhập liệu ban đầu:** Blockchain chỉ đảm bảo dữ liệu không bị sửa đổi sau khi đã ghi. Nếu bác sĩ hoặc kỹ thuật viên cố tình nhập sai thông số ngay từ đầu, hệ thống sẽ trung thực bảo toàn dữ liệu sai đó.
*   **Phạm vi mô phỏng:** Hệ thống hiện tại đang tập trung vào quy trình khép kín tại một cơ sở y tế với sự hỗ trợ của AI cho bệnh tiểu đường. Các kịch bản liên viện hoặc xét nghiệm khẩn cấp ngoài quy trình chưa được khai thác sâu.
*   **Chưa mã hóa dữ liệu y tế lưu trữ (At-Rest):** Nội dung hồ sơ hiện được lưu trong MongoDB dưới dạng Plaintext (chỉ băm Hash lên Blockchain). Đây là điểm cần cải thiện để đáp ứng các tiêu chuẩn bảo mật y tế khắt khe hơn như HIPAA.

### 5.3 Hướng phát triển
*   **Mã hóa dữ liệu lưu trữ (AES-256):** Áp dụng mã hóa Field-level cho nội dung hồ sơ trong MongoDB. Chỉ những bên có khóa giải mã (được chia sẻ qua quyền truy cập Blockchain) mới có thể đọc được nội dung thật.
*   **Tích hợp lưu trữ phi tập trung (IPFS):** Di chuyển các tệp tin y tế dung lượng lớn (X-quang, MRI) lên IPFS và lưu trữ CID (Content ID) lên chuỗi để đạt được tính phi tập trung hoàn toàn.
*   **Cơ chế khôi phục tài khoản (Social Recovery):** Tích hợp mô hình ví trừu tượng hóa tài khoản (Account Abstraction) để cho phép khôi phục quyền truy cập thông qua người giám hộ khi mất ví.
*   **Zero-Knowledge Proofs (ZKP):** Cho phép bệnh nhân chứng minh mình đủ điều kiện sức khỏe (ví dụ: đã tiêm chủng) mà không cần tiết lộ chi tiết toàn bộ hồ sơ bệnh án.
*   **Triển khai trên Layer 2:** Chuyển sang các giải pháp như Arbitrum hoặc Optimism để giảm phí Gas và tăng tốc độ giao dịch cho các cơ sở y tế có lưu lượng bệnh nhân lớn.

---
*Tài liệu này được soạn thảo để đảm bảo mọi bên liên quan đều nắm rõ quy trình vận hành và sự an toàn của dữ liệu y tế trên nền tảng Web3.*

