# ĐỒ ÁN MÔN HỌC IE213 - HỆ THỐNG QUẢN LÝ HỒ SƠ Y TẾ WEB3 (EHR)

Dự án này là hệ thống quản lý bệnh án điện tử tích hợp công nghệ Blockchain để đảm bảo tính toàn vẹn dữ liệu, quyền riêng tư bệnh nhân và minh bạch trong quy trình y tế.

## 1. Thông tin Blockchain (Mandatory)
- **Mạng thử nghiệm:** Ethereum Sepolia (ChainID: `11155111`)
- **Explorer:** [Sepolia Etherscan](https://sepolia.etherscan.io/)

### Smart Contract Addresses:
- **IdentityManager:** `0xBeDC86c7ed2D3BD50b1E06abC5Bb8e6438cFc424`
- **DynamicAccessControl:** `0x3456d590C5e48bfA5057388457784564267F200c`
- **MedicalLedger:** `0x78B739a403f4cE733cF6cD198427a5B006345aD6`

---

## 2. Hướng dẫn cài đặt & Chạy dự án

### Yêu cầu hệ thống:
- Node.js >= 18.x
- MongoDB Atlas (Off-chain storage)
- Ví MetaMask (đã chuyển sang mạng Sepolia và có ETH testnet)

### Các bước khởi chạy:
1. **Clone project:**
   ```bash
   git clone [link-repo]
   cd IE213_BE
   ```
2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```
3. **Cấu hình môi trường:**
   Tạo file `.env` từ mẫu `.env.example` và điền các thông số:
   - `MONGODB_URI`: Link kết nối MongoDB Atlas.
   - `BLOCKCHAIN_RPC_URL`: Link Alchemy/Infura Sepolia.
   - `ADMIN_PRIVATE_KEY`: Private key ví admin (để deploy/quản trị).
   - `IDENTITY_MANAGER_ADDRESS`: Địa chỉ contract Identity.
   - (Xem thêm file `docs/DOCS_BACKEND_BLOCKCHAIN.md` để biết chi tiết)

4. **Khởi động server:**
   ```bash
   npm run dev
   ```

---

## 3. Tối ưu kỹ thuật (Key Features)

Dự án đáp ứng các tiêu chuẩn kỹ thuật nâng cao của môn học IE213:

### A. Cơ chế Fallback RPC (Độ ổn định)
Hệ thống sử dụng mảng đa RPC URLs. Khi một node RPC (như Alchemy) bị lỗi hoặc quá tải, Backend sẽ tự động chuyển sang các node dự phòng (Infura, Public Nodes) mà không làm gián đoạn ứng dụng.

### B. Bảo mật "Zero-Key Server"
Backend hoạt động ở chế độ **Read-only**. Tuyệt đối không lưu Private Key người dùng trên server. Mọi giao dịch thay đổi dữ liệu đều do người dùng trực tiếp xác nhận qua MetaMask.

### C. Tính toàn vẹn dữ liệu (Hash-Chaining)
Áp dụng kỹ thuật móc xích mã băm (Keccak256). Mã băm của chẩn đoán bao gồm mã băm của kết quả xét nghiệm và triệu chứng ban đầu. Điều này tạo ra bằng chứng không thể chối bỏ trên Blockchain cho toàn bộ vòng đời hồ sơ bệnh án.

### D. Xác thực Web3 (Nonce-based Signature)
Hệ thống đăng nhập không dùng mật khẩu truyền thống, mà sử dụng cơ chế ký thông điệp bằng ví (EIP-191) để xác thực định danh người dùng một cách bảo mật nhất.

---

## 4. Tài liệu hướng dẫn
- [Hướng dẫn cho Frontend](docs/DOCS_FRONTEND_WEB3.md)
- [Hướng dẫn cho Backend](docs/DOCS_BACKEND_BLOCKCHAIN.md)

**Nhóm thực hiện: [Tên nhóm của bạn]**
**Giảng viên hướng dẫn: ThS. Võ Tấn Khoa**
