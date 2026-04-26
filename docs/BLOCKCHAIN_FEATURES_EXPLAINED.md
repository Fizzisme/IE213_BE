# GIẢI THÍCH CÁC TÍNH NĂNG BLOCKCHAIN TRONG HỆ THỐNG

Tài liệu này giải thích các khái niệm Web3 được áp dụng thực tế vào quy trình y tế của dự án.

## 1. Đăng ký không tốn Gas (Gasless Onboarding)
Thông thường, để lưu định danh lên Blockchain, người dùng phải tốn phí Gas (ETH/BNB). 
*   **Giải pháp:** Bệnh nhân chỉ cần ký (Sign) một lời nhắn xác nhận trên MetaMask. Admin sẽ dùng ví quản trị để nộp chữ ký đó lên chuỗi (Hàm `registerPatientGasless`).
*   **Lợi ích:** Bệnh nhân không cần biết về tiền điện tử vẫn có thể tham gia hệ thống.

## 2. Kiểm soát Truy cập Động (Dynamic Access Control)
Quyền xem hồ sơ bệnh án không được cấp vĩnh viễn.
*   **Cơ chế:** Khi đặt lịch khám, bệnh nhân cấp quyền cho bác sĩ trong vòng 24 giờ.
*   **Hợp nhất UX (1-Transaction):** Ngay khi nhấn "Đặt lịch", hệ thống trả về địa chỉ ví của Bác sĩ để Bệnh nhân ký cấp quyền ngay lập tức. Không cần thao tác rời rạc.
*   **Tự động hết hạn:** Sau 24 giờ, Smart Contract tự động từ chối quyền truy cập của bác sĩ mà không tốn thêm bất kỳ phí Gas nào để xóa quyền.

## 3. Móc xích mã băm (Hash-Chaining)
Đây là tính năng bảo vệ dữ liệu cốt lõi, đảm bảo bệnh án không thể bị sửa đổi.
*   **Luồng mắt xích:** 
    1.  Bác sĩ tạo hồ sơ ➡️ Ghi mã băm 1.
    2.  Lab Tech trả kết quả ➡️ Ghi mã băm 2 (Băm gộp: Hash 1 + Dữ liệu Lab).
    3.  Bác sĩ chẩn đoán ➡️ Ghi mã băm 3 (Băm gộp: Hash 2 + Dữ liệu Diagnosis).
*   **Tính nghiêm ngặt (Strict Flow):** Hệ thống bắt buộc phải có kết quả xét nghiệm (Bước 2) thì mới cho phép chẩn đoán (Bước 3). Nếu nhảy cóc, Blockchain sẽ báo lỗi "Invalid State".

## 4. Kiểm tra tính toàn vẹn (Integrity Check)
Bất cứ lúc nào, người dùng có thể nhấn nút "Kiểm tra toàn vẹn". 
*   **Cách thức:** Hệ thống sẽ lấy dữ liệu hiện tại trong Database ➡️ Băm lại thành mã Hash ➡️ So sánh với mã Hash gốc trên Blockchain.
*   **Cảnh báo:** Nếu kết quả trả về `isValid: false`, nghĩa là dữ liệu trong Database đã bị can thiệp trái phép bởi Admin hoặc Hacker.

## 5. Thu hồi quyền tức thì (Instant Revoke)
Khi bệnh nhân hủy lịch khám, hệ thống sẽ gợi ý ký giao dịch thu hồi quyền ngay lập tức để bác sĩ không thể xem hồ sơ cũ, đảm bảo tính riêng tư tuyệt đối.
