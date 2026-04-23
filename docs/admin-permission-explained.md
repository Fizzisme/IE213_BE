# Giải thích cơ chế phân quyền Admin trong hệ thống EHR Blockchain

## Trạng thái tài liệu

Tài liệu này đã được cập nhật theo kiến trúc hiện tại: **MetaMask-only signing** (backend không ký giao dịch bằng private key runtime).

## Câu trả lời ngắn gọn

Hệ thống có 2 tầng quyền độc lập:

| Tầng | Căn cứ quyền | Dùng cho việc gì |
|------|-------------|-----------------|
| **Smart Contract Admin** | Wallet address có role ADMIN on-chain | Được phép thực thi admin functions trên smart contract khi ví đó ký giao dịch |
| **Backend Admin** | `role = ADMIN` trong MongoDB + account ACTIVE | Đăng nhập khu vực admin, quản lý nghiệp vụ backend |

**Quan trọng:**

- Có `role = ADMIN` trong DB **không tự động** có quyền on-chain.
- Quyền on-chain luôn phụ thuộc `msg.sender` trên smart contract.
- Backend hiện tại dùng mô hình `prepare -> frontend ký MetaMask -> confirm(txHash)`.

---

## Tầng 1: Smart Contract Admin (on-chain)

### Căn cứ quyền

Smart contract kiểm tra quyền theo `msg.sender`.

Điều kiện để gọi hàm admin on-chain:

- Địa chỉ ví ký giao dịch phải có role ADMIN trên contract.
- Status của account admin đó phải ACTIVE.

### Vai trò của ví deployer

- Ví deployer thường là admin đầu tiên trên chain.
- Sau đó có thể mở rộng admin bằng cơ chế on-chain tương ứng (`addAdmin` nếu contract hỗ trợ).

---

## Tầng 2: Backend Admin (off-chain)

### Căn cứ quyền

Backend xác thực admin theo dữ liệu MongoDB:

- `role = ADMIN`
- `status = ACTIVE`
- Có quyền truy cập endpoint admin theo middleware hiện hành

### Backend làm gì trong flow blockchain?

Backend **không ký thay**. Backend chỉ:

1. Validate nghiệp vụ + quyền truy cập.
2. Prepare unsigned transaction data (`txRequest`).
3. Trả dữ liệu cho frontend ký/broadcast bằng MetaMask.
4. Nhận `txHash` ở bước confirm.
5. Verify tx on-chain (from/to/function/args/event nếu cần), rồi cập nhật DB/audit.

---

## Ai ký giao dịch trong kiến trúc hiện tại?

| Role | Đăng nhập | Ký giao dịch blockchain |
|------|----------|------------------------|
| **Admin** | nationId + password | **Admin wallet ký trên MetaMask** |
| **Patient** | MetaMask (ký message) | **Patient wallet ký trên MetaMask** |
| **Doctor** | MetaMask (ký message) | **Doctor wallet ký trên MetaMask** |
| **Lab Tech** | MetaMask (ký message) | **Lab Tech wallet ký trên MetaMask** |

---

## Ví dụ flow admin on-chain (MetaMask-only)

```text
Admin (UI)                     Backend                         Blockchain
   |                              |                                |
   | 1) Gọi API prepare           |                                |
   |----------------------------->|                                |
   |                              | 2) Validate + trả txRequest    |
   |<-----------------------------|                                |
   | 3) Ký + broadcast MetaMask   |                                |
   |--------------------------------------------------------------->|
   | 4) Nhận txHash               |                                |
   | 5) Gọi API confirm(txHash)   |                                |
   |----------------------------->|                                |
   |                              | 6) Verify tx + cập nhật DB/audit
```

---

## Kết luận

- Phân quyền backend và on-chain vẫn tách biệt rõ ràng.
- Runtime hiện tại **không phụ thuộc backend private key để ký giao dịch**.
- Toàn bộ hành động on-chain phải đi qua ví người dùng tương ứng trên MetaMask.
