# PHÂN TÍCH CHUYÊN SÂU HỆ THỐNG BLOCKCHAIN TRONG EHR

Tài liệu này giải thích các chức năng cốt lõi, ưu điểm kỹ thuật và lý do kiến trúc của các thành phần Blockchain trong dự án IE213.

## 1. Trụ cột Định danh: IdentityManager.sol
Đây là "trái tim" của hệ thống quản lý vai trò (Role-Based Access Control - RBAC).

### Chức năng:
- Phân tách quyền hạn rõ ràng giữa: Admin, Bác sĩ, Kỹ thuật viên và Bệnh nhân.
- **Tính năng Gasless Onboarding:** Cho phép Admin "bao cấp" phí Gas khi đăng ký bệnh nhân mới thông qua xác thực chữ ký số (ECDSA).

### Ưu điểm vượt trội:
- **Xóa bỏ rào cản Web3:** Người dùng bình thường không cần có ETH vẫn có thể tham gia hệ thống.
- **Tiết kiệm Gas:** Sử dụng `Enum` và `Mapping` thay vì `String` để giảm thiểu chi phí lưu trữ trên mạng Ethereum.
- **Bảo mật cao:** Sử dụng thư viện `ECDSA` của OpenZeppelin để chống các cuộc tấn công giả mạo chữ ký.

## 2. Trụ cột Kiểm soát: DynamicAccessControl.sol
Giải quyết bài toán: "Ai được quyền xem hồ sơ bệnh án và trong bao lâu?".

### Chức năng:
- **Cấp quyền theo thời gian (Time-bound Access):** Quyền truy cập không vĩnh viễn, sẽ tự động hết hạn sau X giờ (ví dụ: 24h khám bệnh).
- **Thu hồi quyền chủ động:** Bệnh nhân có thể "ngắt kết nối" với bác sĩ bất cứ lúc nào.

### Ưu điểm vượt trội:
- **Lazy Evaluation (Đánh giá lười):** Hệ thống không tốn Gas để "xóa" quyền khi hết hạn. Thay vào đó, hàm `canAccess` sẽ so sánh `block.timestamp` với `expiresAt`. Nếu quá hạn, quyền tự động biến mất -> Cực kỳ tiết kiệm chi phí.
- **Chủ quyền dữ liệu (Data Sovereignty):** Bệnh nhân là người thực sự nắm giữ chìa khóa dữ liệu của mình, bác sĩ chỉ là người được "mượn" chìa khóa tạm thời.

## 3. Trụ cột Toàn vẹn: MedicalLedger.sol & Hash-Chaining
Đây là nơi lưu trữ bằng chứng (Proof of Existence) của các bệnh án.

### Chức năng:
- **Hash-Chaining (Móc xích mã băm):** Kỹ thuật "vàng" trong bảo mật dữ liệu. Mỗi bước trong quy trình khám bệnh (Triệu chứng -> Xét nghiệm -> Chẩn đoán) đều được băm lồng vào nhau.
- **Verify Integrity:** Hàm đối chiếu mã băm tức thời giữa MongoDB và Blockchain.

### Ưu điểm vượt trội:
- **Chống giả mạo tuyệt đối (Immutability):** Nếu Admin database sửa triệu chứng ở bước 1, mã băm ở bước 2 và 3 sẽ bị "gãy" ngay lập tức khi so khớp trên Blockchain. Điều này tạo ra một chuỗi bằng chứng không thể chối cãi (Audit Trail).
- **Hybrid Storage (Lưu trữ lai):** Chỉ lưu Hash (32 bytes) lên On-chain thay vì lưu toàn bộ hồ sơ. Giúp hệ thống có tốc độ nhanh như Web2 nhưng vẫn có độ tin cậy của Web3.

## 4. Tối ưu kỹ thuật (Infrastructure level)

### A. Cơ chế Fallback RPC (Độ tin cậy 99.9%)
- **Chức năng:** Tự động luân chuyển giữa Alchemy, Infura và Public Nodes.
- **Ưu điểm:** Loại bỏ điểm yếu duy nhất (Single Point of Failure). Nếu một nhà cung cấp RPC bị sập hoặc hết băng thông, hệ thống vẫn hoạt động bình thường. Đây là tiêu chí "Tối ưu kỹ thuật" quan trọng trong đồ án.

### B. Kiến trúc Zero-Key Server
- **Chức năng:** Backend chỉ đọc (Read-only), không giữ Private Key của user.
- **Ưu điểm:** Ngay cả khi Server bị hack, hacker cũng không thể đánh cắp tiền hay giả mạo giao dịch của người dùng vì Backend không có quyền ký.

### C. Nonce-based Authentication
- **Chức năng:** Đăng nhập bằng chữ ký số kèm mã Nonce dùng 1 lần.
- **Ưu điểm:** Chống lại tấn công "Replay Attack" (kẻ xấu dùng lại chữ ký cũ để đăng nhập trái phép).

---
## Tóm lại: Tại sao hệ thống này "xịn"?
Dự án không chỉ tích hợp Blockchain theo kiểu "trình diễn" (cho có), mà thực sự giải quyết được 3 bài toán lớn của ngành y tế:
1. **Minh bạch:** Không ai có thể âm thầm sửa hồ sơ bệnh án.
2. **Riêng tư:** Bác sĩ chỉ xem được khi bệnh nhân cho phép.
3. **Trải nghiệm:** Bệnh nhân tham gia dễ dàng (Gasless) và hệ thống luôn sẵn sàng (Fallback RPC).
