# HƯỚNG DẪN TÍCH HỢP WEB3 CHO FRONTEND

Tài liệu này hướng dẫn cách kết nối Giao diện (React/Next.js) với hệ thống Blockchain Sepolia thông qua Backend.

## 1. Thông số kỹ thuật
- **Mạng (Network):** Ethereum Sepolia (ChainID: `11155111`).
- **Địa chỉ Contract:** Lấy từ API `/v1/config/blockchain` (nếu có) hoặc copy từ file `.env` của Backend.
- **Thư viện khuyến nghị:** `ethers.js` (v6).

---

## 2. Các luồng nghiệp vụ quan trọng (BẮT BUỘC THEO ĐÚNG THỨ TỰ)

### A. Đăng nhập bằng ví (Wallet Login)
1. **Lấy Nonce:** Gọi `POST /v1/auth/login-by-wallet` gửi `{ "walletAddress": "0x..." }`.
2. **Ký thông điệp & Xác thực:**
```javascript
// Code mẫu sử dụng ethers.js v6
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// 1. Lấy nonce từ API
const { nonce } = await axios.post('/v1/auth/login-by-wallet', { walletAddress });

// 2. Ký nonce
const signature = await signer.signMessage(nonce);

// 3. Gửi signature để login
const response = await axios.post('/v1/auth/login-by-wallet', {
    walletAddress,
    signature
});
```

### B. Đăng ký Bệnh nhân (Gasless Onboarding)
Nếu là bệnh nhân mới, cần ký thêm `registrationSignature` để Admin nộp giúp.
```javascript
const regMsg = "REGISTER_ZUNI_PATIENT";
const registrationSignature = await signer.signMessage(regMsg);

// Gửi kèm khi gọi API login/register lần đầu
await axios.post('/v1/auth/login-by-wallet', {
    walletAddress,
    signature,
    registrationSignature
});
```

### C. Giao dịch Hồ sơ bệnh án (Flow 3 bước)
1. **Backend:** Bác sĩ gọi API tạo hồ sơ -> nhận `recordHash` và `medicalRecordId`.
2. **Blockchain:** Frontend gọi Smart Contract:
```javascript
const medicalLedger = new ethers.Contract(CONTRACT_ADDR, ABI, signer);

// Gọi hàm trên Smart Contract
const tx = await medicalLedger.createRecord(
    medicalRecordId, 
    patientAddress, 
    recordHash
);

// Đợi giao dịch được đào xong (Mining)
const receipt = await tx.wait();

// 3. Đồng bộ lại với Backend
await axios.post(`/v1/medical-records/${medicalRecordId}/verify-tx`, {
    txHash: receipt.hash
});
```

### D. Cấp quyền truy cập (Grant Access)
Thực hiện trong module Lịch hẹn (Appointment).
```javascript
const accessControl = new ethers.Contract(ACCESS_CONTRACT_ADDR, ABI, signer);

// Cấp quyền cho bác sĩ xem trong 24 giờ
const tx = await accessControl.grantAccess(doctorAddress, 24);
await tx.wait();

// Gọi API verify-grant-access để cập nhật trạng thái lịch hẹn
await axios.post(`/v1/appointments/${appointmentId}/verify-grant-access`, {
    txHash: tx.hash
});
```

---

## 3. Lưu ý về Trải nghiệm người dùng (UX) - Tiêu chí 2.4
- **Chờ giao dịch:** Khi giao dịch đang xử lý, phải có Loading che màn hình hoặc thông báo "Đang ghi dữ liệu lên Blockchain, vui lòng không đóng trình duyệt".
- **Sai mạng:** Luôn kiểm tra `window.ethereum.chainId`. Nếu không phải `0xaa36a7` (Sepolia), hãy yêu cầu người dùng đổi mạng trước khi thao tác.
- **Phí Gas:** Luôn kiểm tra số dư ETH trước khi gửi giao dịch. Nếu thiếu Gas, hãy hướng dẫn người dùng lấy ETH tại các trang Faucet Sepolia.

---

## 4. Xử lý lỗi
- Nếu API trả về `403 Forbidden` kèm thông báo "Bạn không có quyền truy cập hồ sơ này trên Blockchain", nghĩa là quyền truy cập thời gian thực (Dynamic Access Control) đã hết hạn. Yêu cầu Bệnh nhân cấp lại quyền.