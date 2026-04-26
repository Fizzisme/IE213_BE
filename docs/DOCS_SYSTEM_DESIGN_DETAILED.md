# 3. THIẾT KẾ HỆ THỐNG Y TẾ TRÊN BLOCKCHAIN

### 3.1.2. Các thành phần cốt lõi trong Hệ thống
Hệ thống được xây dựng dựa trên sự phối hợp giữa ba hợp đồng thông minh cốt lõi và mô hình lưu trữ lai:
*   **IdentityManager** đóng vai trò sổ cái định danh và phân quyền. Hợp đồng này lưu trữ địa chỉ ví và vai trò (`Role`) của từng người dùng (`PATIENT`, `DOCTOR`, `LAB_TECH`, `ADMIN`). Đặc biệt, nó hỗ trợ cơ chế **Gasless Onboarding** cho phép Bệnh nhân đăng ký định danh mà không cần sở hữu ETH.
*   **DynamicAccessControl** xử lý logic kiểm soát truy cập dựa trên sự đồng thuận của Bệnh nhân. Hợp đồng sử dụng cấu trúc `AccessToken` để lưu quyền xem hồ sơ theo thời hạn (mặc định 24h). Mọi yêu cầu đọc/ghi dữ liệu y tế đều phải vượt qua hàm `canAccess` của hợp đồng này.
*   **MedicalLedger** hoạt động như một sổ cái lưu vết vĩnh viễn vòng đời của hồ sơ bệnh án. Hợp đồng thực thi kỹ thuật **Hash-Chaining (Móc xích mã băm)** để nối liền 3 giai đoạn: `Khởi tạo (recordHash)` → `Xét nghiệm (testResultHash)` → `Chẩn đoán (diagnosisHash)`. Mắt xích sau luôn băm kèm mã băm của mắt xích trước, đảm bảo tính toàn vẹn của cả chuỗi dữ liệu.
*   **Mô hình lưu trữ lai (Hybrid Storage):** Dữ liệu chi tiết lưu tại **MongoDB** để tối ưu tốc độ; Blockchain đóng vai trò **"Neo sự thật" (Truth Anchor)** — chỉ lưu mã băm Keccak-256 và trạng thái quy trình. Bất kỳ thay đổi trái phép nào ở Database đều bị phát hiện ngay khi đối chiếu hash.

### 3.1.3. Kiến trúc Hệ thống
Hệ thống kết hợp giữa máy chủ tập trung (Node.js/Express) và mạng lưới phi tập trung (Ethereum/EVM). 
*   **Tầng Off-chain:** Xử lý logic nghiệp vụ, tích hợp AI dự đoán bệnh và lưu trữ dữ liệu dung lượng lớn tại MongoDB.
*   **Tầng On-chain:** Lưu trữ "vân tay số" của dữ liệu và thực thi các quy tắc phân quyền không thể đảo ngược.
*   **Mẫu Chuẩn bị và Xác nhận (Prepare/Confirm Pattern):** Backend tính toán mã Hash và chuẩn bị metadata giao dịch, sau đó người dùng ký duyệt trực tiếp trên ví MetaMask cá nhân. Cuối cùng, Backend thực hiện xác minh (`verifyTx`) để đảm bảo giao dịch đã được đào thành công trước khi cập nhật trạng thái trong Database.

### 3.1.4. Quản lý Định danh và Vai trò Người dùng
Định danh được gắn liền với địa chỉ ví Ethereum qua hợp đồng `IdentityManager`. Hệ thống áp dụng cơ chế **"Ví là Danh tính"**. 
*   Đối với Nhân viên y tế: Admin trực tiếp đăng ký ví và gán Role sau khi thẩm định hồ sơ thực tế.
*   Đối với Bệnh nhân: Sử dụng chữ ký số Off-chain để thực hiện giao dịch đăng ký On-chain (Gasless), giúp gỡ bỏ rào cản kỹ thuật cho người dùng phổ thông mà vẫn đảm bảo tính chính chủ của ví.

### 3.1.5. Khởi tạo và Phân quyền Lịch hẹn
Mọi quy trình y tế bắt đầu từ module **Appointment**. Hệ thống áp dụng luồng **1-Transaction UX**: khi Bệnh nhân đặt lịch khám, họ **bắt buộc chọn Bác sĩ** và thực hiện cấp quyền `grantAccess` ngay trên giao diện đặt lịch. Điều này đảm bảo khi Bác sĩ tiếp nhận bệnh nhân, họ đã có sẵn quyền truy cập hợp lệ trên Blockchain để khởi tạo hồ sơ bệnh án.

### 3.1.6. Cơ chế Cấp quyền và Đồng thuận của Bệnh nhân
Bệnh nhân thực thi quyền tự quyết dữ liệu thông qua `DynamicAccessControl`. 
*   **Cấp quyền:** Thực hiện song song với việc đặt lịch hoặc chẩn đoán.
*   **Thu hồi:** Khi Bệnh nhân hủy lịch khám, hệ thống hỗ trợ ký giao dịch `revokeAccess` ngay lập tức để thu hồi quyền xem của Bác sĩ, bảo vệ quyền riêng tư dữ liệu y tế nhạy cảm.

### 3.2. Cơ chế Kiểm soát Truy cập
Hệ thống kết hợp lớp kiểm soát vai trò (RBAC) và lớp kiểm soát đồng thuận (Consent-based). 
*   **Time-bound Access:** Quyền truy cập có thời hạn.
*   **Lazy Evaluation:** Smart Contract tự động đối chiếu `block.timestamp` với thời điểm hết hạn để từ chối truy cập mà không cần tiến hành xóa quyền thủ công, giúp tiết kiệm chi phí Gas tối đa.

### 3.3. Cơ chế Đồng bộ Sự kiện và Nhật ký Kiểm toán
Mọi thao tác ghi lên Blockchain đều phát ra `Event`. Backend lắng nghe các sự kiện này để cập nhật cờ `isSynced` trong Database. Hệ thống duy trì nhật ký kiểm toán (Audit Log) tập trung, quy về một mối toàn bộ mã giao dịch (`createTxHash`, `labTxHash`, `diagnosisTxHash`) cho mỗi hồ sơ bệnh án, phục vụ tra cứu lịch sử khám chữa bệnh minh bạch.

### 3.4. Xác minh Tính toàn vẹn Dữ liệu
Sử dụng cơ chế **Khóa Hash 3 Lớp (Móc xích)**:
1.  **Giai đoạn 1:** Bác sĩ tạo hồ sơ ➡️ lưu `recordHash`.
2.  **Giai đoạn 2:** Lab Tech trả kết quả ➡️ lưu `testResultHash = keccak256(recordHash + dữ liệu_xét_nghiệm)`.
3.  **Giai đoạn 3:** Bác sĩ chốt bệnh ➡️ lưu `diagnosisHash = keccak256(testResultHash + dữ liệu_chẩn_đoán)`.
Tính năng **`verifyIntegrity`** cho phép đối chiếu chéo dữ liệu theo từng tầng, lập tức phát hiện và chỉ đích danh mắt xích nào bị thay đổi trái phép.

### 3.5. Quy trình Chẩn đoán Nghiêm ngặt (Strict Flow)
Để bảo vệ tính logic của chuỗi móc xích, hệ thống áp dụng **Strict Flow**: Bác sĩ chỉ có thể thực hiện chẩn đoán khi hồ sơ đã có kết quả xét nghiệm (`HAS_RESULT`). Điều này ngăn chặn việc "nhảy cóc" quy trình trên Blockchain, đảm bảo mọi chẩn đoán y khoa đều dựa trên bằng chứng xét nghiệm thực tế và được neo giữ an toàn trên chuỗi.
