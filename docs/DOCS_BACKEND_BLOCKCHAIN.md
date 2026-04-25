# BLOCKCHAIN ARCHITECTURE - DÀNH CHO BACKEND DEVELOPER

Chào ông bạn, đây là tài liệu "bí kíp" để ông quản lý phần lõi Blockchain của dự án mà không làm chết hệ thống.

## 1. Kiến trúc Hybrid Storage (Dữ liệu lai)
Chúng ta không lưu toàn bộ bệnh án lên Blockchain (vì phí Gas rất đắt và không bảo mật). 
- **MongoDB:** Lưu dữ liệu thô (Triệu chứng, tên bệnh nhân, note...).
- **Blockchain:** Lưu mã băm (Hash) của dữ liệu đó. Blockchain đóng vai trò là **"Thẩm phán"** để xác minh xem dữ liệu trong MongoDB có bị ai sửa lén hay không.

## 2. Hệ thống Fallback RPC (Linh hồn của tính ổn định)
Mở file `src/blockchains/provider.js` ra. Tôi đã viết cơ chế tự động đổi link RPC.
- Link 1 (Alchemy) chết -> Tự nhảy sang Link 2 (Infura) -> Tự nhảy sang Link công khai.
- **Dặn dò:** Đừng bao giờ hardcode link RPC vào code. Luôn dùng mảng `SEPOLIA_RPC_URLS` lấy từ `.env`. Nếu hệ thống báo "RPC Error", hãy kiểm tra xem API Key trong `.env` có hết hạn hoặc bị quá tải không.

## 3. Cơ chế Hash-Chaining (Móc xích mã băm)
Đây là phần "ăn điểm" kỹ thuật cao nhất của chúng ta. 
- Hồ sơ gốc có `recordHash`.
- Kết quả xét nghiệm có `testResultHash = Hash(recordHash + kết quả mới)`.
- Chẩn đoán có `diagnosisHash = Hash(testResultHash + chẩn đoán)`.
=> **Hệ quả:** Nếu ông sửa 1 ký tự ở triệu chứng ban đầu trong DB, toàn bộ chuỗi Hash phía sau sẽ bị báo lỗi khi chạy hàm `verifyIntegrity`. Đừng bao giờ thay đổi logic tính toán trong `src/utils/algorithms.js` nếu không muốn toàn bộ dữ liệu cũ bị biến thành "giả mạo".

## 4. CẢNH BÁO: Vấn đề "Stable Hash"
Hàm `JSON.stringify()` trong JS không đảm bảo thứ tự các key. 
- **Nguy cơ:** `{a:1, b:2}` băm ra mã khác với `{b:2, a:1}`.
- **Giải pháp:** Trước khi băm, tôi đã dặn là phải dùng dữ liệu theo đúng cấu trúc Schema. Nếu ông thay đổi thứ tự các field trong Model MongoDB, ông phải báo ngay cho Frontend để họ cập nhật logic băm tương ứng, nếu không sẽ không bao giờ so khớp (verify) được.

## 5. QUY TẮC BẢO MẬT: Quản lý ADMIN_PRIVATE_KEY
Trong file `.env` có biến `ADMIN_PRIVATE_KEY`. Đây là "tử huyệt" của toàn bộ hệ thống On-chain.

- **Mục đích duy nhất hiện tại:** Dùng cho công cụ Hardhat thực hiện các nhiệm vụ "thiết lập" (Deploy Smart Contract, Verify Code). Backend hiện tại đang chạy ở chế độ **Read-only** (không tự ký giao dịch), nên Key này không tham gia vào luồng xử lý API hàng ngày.
- **Tại sao phải giữ trong .env?** Để khi có cập nhật Contract hoặc cần Admin thực hiện các lệnh đặc quyền On-chain (như thu hồi vai trò Bác sĩ), chúng ta có sẵn môi trường để thực thi qua script mà không cần nhập tay thủ công.
- **QUY TẮC "3 KHÔNG":**
    1. **KHÔNG** bao giờ sử dụng `env.ADMIN_PRIVATE_KEY` trực tiếp trong các file Logic/Service của Backend để tự ký giao dịch (trừ khi có yêu cầu đặc biệt và đã thông qua kiểm duyệt bảo mật). Mọi giao dịch thay đổi dữ liệu phải do người dùng ký qua MetaMask.
    2. **KHÔNG** được in (console.log) key này ra log server hoặc trả về trong bất kỳ API response nào.
    3. **KHÔNG** commit file `.env` lên GitHub. Hãy dùng file `.env.example` để hướng dẫn.

- **Lưu ý vận hành:** Ví ứng với Key này phải luôn có một ít ETH Sepolia. Nếu ví hết tiền, các script quản trị hoặc lệnh nộp chữ ký Gasless từ Admin sẽ thất bại hoàn toàn. Sau khi Deploy thành công, bạn có thể tạm thời xóa Key này khỏi môi trường Production nếu không có kế hoạch chạy script quản trị thường xuyên.

## 6. Luồng Verify Transaction
Khi Frontend gửi `txHash` về, đừng tin nó ngay. Hãy dùng hàm `blockchainProvider.waitForTransaction(txHash)`. Hàm này sẽ đợi mạng xác nhận `receipt.status === 1` (thành công) thì mình mới được phép cập nhật DB. Đừng bao giờ update status thành "Đã đồng bộ" chỉ dựa trên việc Frontend báo "Em gửi rồi".

---
**Chúc ông vận hành tốt, có gì không hiểu thì hỏi tôi ngay!**