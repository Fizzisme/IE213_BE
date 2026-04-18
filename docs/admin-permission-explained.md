# Giải thích cơ chế phân quyền Admin trong hệ thống EHR Blockchain

## Câu hỏi chính

> Admin trong đây được có quyền dựa trên cái gì? Dựa trên wallet address hay sao?
> Tức là cứ có role ADMIN là được duyệt? Còn admin_secret_key của ví đã deploy là vô dụng?

## Câu trả lời ngắn gọn

**Có 2 tầng admin hoàn toàn độc lập nhau:**

| Tầng | Căn cứ quyền | Dùng cho việc gì |
|------|-------------|-----------------|
| **Smart Contract Admin** | Wallet address (ví deployer) | Ký giao dịch blockchain |
| **Backend Admin** | Role = ADMIN trong MongoDB | Đăng nhập hệ thống, quản lý user |

**→ Có role ADMIN trong database KHÔNG ĐỦ để gọi smart contract.**
**→ Có private key deployer KHÔNG ĐỦ để đăng nhập hệ thống.**

---

## Tầng 1: Smart Contract Admin (Blockchain)

### Căn cứ quyền

Trong [`AccountManager.sol`](contracts/AccountManager.sol:82), hàm `onlyAdmin` kiểm tra:

```solidity
modifier onlyAdmin() {
    Account storage senderAccount = accounts[msg.sender];
    if (senderAccount.role != Role.ADMIN) revert NotAdmin();
    if (senderAccount.status != AccountStatus.ACTIVE) revert AdminNotActive();
    _;
}
```

**Điều kiện**: `msg.sender` (địa chỉ ví gửi giao dịch) phải có:

- `role = ADMIN` trên blockchain
- `status = ACTIVE` trên blockchain

### Ai là admin đầu tiên?

Khi deploy contract, trong [`constructor`](contracts/AccountManager.sol:90):

```solidity
constructor() {
    admin = msg.sender;  // Ví deployer = admin đầu tiên
    accounts[msg.sender] = Account({
        role: Role.ADMIN,
        status: AccountStatus.ACTIVE,
        ...
    });
}
```

**→ Ví deploy contract tự động trở thành ADMIN trên blockchain.**

### ADMIN_PRIVATE_KEY dùng cho việc gì?

Trong [`.env`](.env:17):

```
ADMIN_PRIVATE_KEY=3e9d590d06edc0c1cdd88bcdb52f96364bf7a95dfb1309d251bbecec8ba0f82b
```

Private key này dùng để:

1. **Ký giao dịch blockchain** thay mặt hệ thống (backend)
2. Ví dụ: khi admin backend duyệt user, backend dùng private key này ký giao dịch gọi `approveAccount()` trên blockchain
3. Đây là ví deployer → mặc định là admin trên blockchain

**Tóm lại**: `ADMIN_PRIVATE_KEY` = private key của ví deployer = ví có quyền admin trên smart contract.

---

## Tầng 2: Backend Admin (MongoDB)

### Căn cứ quyền

Trong [`adminAuth.service.js`](src/services/adminAuth.service.js:49):

```javascript
if (user.role !== userModel.USER_ROLES.ADMIN) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Không có quyền truy cập khu vực admin');
}
```

**Điều kiện**: User trong MongoDB phải có:

- `role = 'ADMIN'`
- `status = 'ACTIVE'`
- Có hồ sơ trong bảng `admins`

### Ai tạo backend admin?

Backend admin được tạo bằng cách:

1. Đăng ký user bình thường qua `POST /v1/auth/register`
2. Trực tiếp sửa database: đổi `role` từ `PATIENT` thành `ADMIN`
3. Tạo document trong bảng `admins` liên kết với user đó

**Hiện tại trong database:**

```
Nation ID: 064205000890
Email: nguyenletuanphi910.2019@gmail.com
Role: ADMIN
Status: ACTIVE
```

---

## Mối quan hệ giữa 2 tầng admin

```
┌─────────────────────────────────────────────────────────────┐
│                    HỆ THỐNG EHR BLOCKCHAIN                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────────┐ │
│  │   BACKEND (MongoDB)  │      │  BLOCKCHAIN (Sepolia)    │ │
│  ├──────────────────────┤      ├──────────────────────────┤ │
│  │                      │      │                          │ │
│  │  User: role=ADMIN    │      │  Account: role=ADMIN     │ │
│  │  Login: nationId +   │      │  Check: msg.sender ==    │ │
│  │         password     │      │         admin address    │ │
│  │                      │      │                          │ │
│  │  Dùng cho:           │      │  Dùng cho:               │ │
│  │  - Đăng nhập hệ thống│      │  - Ký giao dịch on-chain │ │
│  │  - Quản lý user      │      │  - approveAccount()      │ │
│  │  - Xem audit logs    │      │  - rejectAccount()       │ │
│  │                      │      │  - addDoctor()           │ │
│  │                      │      │  - addLabTech()          │ │
│  └──────────┬───────────┘      └────────────┬─────────────┘ │
│             │                               │               │
│             │    ADMIN_PRIVATE_KEY           │               │
│             │    (ví deployer)               │               │
│             └───────────────────────────────┘               │
│                      │                                       │
│              Backend ký giao dịch                           │
│              bằng private key này                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Trả lời câu hỏi cụ thể

### Câu 1: Admin có quyền dựa trên cái gì?

**Backend admin**: Dựa trên `role = 'ADMIN'` trong MongoDB + đăng nhập bằng `nationId` + `password`.

**Blockchain admin**: Dựa trên `wallet address` có `role = ADMIN` trên smart contract.

### Câu 2: Cứ có role ADMIN là được duyệt?

**Đúng cho backend**: Ai có `role = ADMIN` trong MongoDB đều đăng nhập được vào hệ thống admin.

**Sai cho blockchain**: Có role ADMIN trong MongoDB KHÔNG ĐỦ để gọi smart contract. Phải dùng đúng ví có quyền admin trên blockchain (ví deployer hoặc ví được addAdmin).

### Câu 3: admin_secret_key của ví đã deploy là vô dụng?

**KHÔNG VÔ DỤNG.** Private key deployer rất quan trọng:

1. **Không có nó → không ký được giao dịch blockchain**
2. Khi backend gọi `approveAccount()`, `rejectAccount()`, `addDoctor()`... cần ký giao dịch bằng private key
3. Nếu dùng sai private key → giao dịch sẽ bị revert vì `msg.sender` không phải admin trên blockchain

**Tuy nhiên**: Nếu backend admin muốn dùng ví khác (không phải ví deployer) để ký giao dịch, cần:

1. Gọi `addAdmin(newAdminAddress)` từ ví deployer cũ
2. Cập nhật `ADMIN_PRIVATE_KEY` trong `.env` thành private key của ví mới

---

## Câu hỏi: Vậy admin-private-key sẽ được dùng để admin ký các contracts?

**KHÔNG HOÀN TOÀN ĐÚNG.**

`ADMIN_PRIVATE_KEY` dùng để backend (server) ký giao dịch blockchain **thay mặt** admin, không phải admin trực tiếp ký.

### Luồng hoạt động thực tế

```
Admin (người dùng)                    Backend (server)                 Blockchain
      |                                    |                              |
      | 1. Đăng nhập nationId + password    |                              |
      |----------------------------------->|                              |
      |                                    |                              |
      | 2. Click "Duyệt user"              |                              |
      |----------------------------------->|                              |
      |                                    | 3. Dùng ADMIN_PRIVATE_KEY    |
      |                                    |    ký giao dịch              |
      |                                    |------------------------------>|
      |                                    | 4. approveAccount() on-chain |
      | 5. Nhận kết quả                    |<------------------------------|
      |<-----------------------------------|                              |
```

**Tóm lại**: Admin không trực tiếp ký giao dịch. Backend ký thay bằng `ADMIN_PRIVATE_KEY`.

---

## Các role khác hoạt động ra sao?

### Bệnh nhân (PATIENT)

**Mỗi bệnh nhân = 1 ví MetaMask**

```
Bệnh nhân                         Backend                         Blockchain
    |                                |                                |
    | 1. Đăng nhập bằng MetaMask     |                                |
    |    (ký message → signature)    |                                |
    |------------------------------->|                                |
    |                                | 2. Gọi registerPatient()      |
    |                                |------------------------------->|
    |                                |    (dùng ADMIN_PRIVATE_KEY)    |
    | 3. Bệnh nhân tự ký giao dịch  |                                |
    |    (khi cần)                   |                                |
    |------------------------------->|                                |
    |                                | 4. Gọi grantAccess()          |
    |                                |------------------------------->|
    |                                |    (dùng ADMIN_PRIVATE_KEY)    |
```

**Bệnh nhân ký khi nào?**

- Đăng nhập: Ký message (không tốn gas)
- Xác nhận consent: Backend ký thay (dùng ADMIN_PRIVATE_KEY)
- Cấp quyền: Backend ký thay (dùng ADMIN_PRIVATE_KEY)

**Tại sao bệnh nhân không trực tiếp ký giao dịch?**

- Để đơn giản hóa UX: bệnh nhân không cần lo về gas, nonce, v.v.
- Backend ký thay → bệnh nhân chỉ cần click "Đồng ý"
- Bệnh nhân vẫn sở hữu dữ liệu: chỉ bệnh nhân mới có quyền consent, revoke

---

### Bác sĩ (DOCTOR)

**Mỗi bác sĩ = 1 ví MetaMask**

```
Bác sĩ                              Backend                         Blockchain
   |                                   |                                |
   | 1. Admin thêm bác sĩ              |                                |
   |    (admin click "Thêm bác sĩ")    |                                |
   |---------------------------------->|                                |
   |                                   | 2. Gọi addDoctor()            |
   |                                   |------------------------------->|
   |                                   |    (dùng ADMIN_PRIVATE_KEY)    |
   |                                   |                                |
   | 3. Bệnh nhân cấp quyền cho bác sĩ|                                |
   |    (grantAccess)                  |                                |
   |                                   |                                |
   | 4. Bác sĩ tạo lab order          |                                |
   |---------------------------------->|                                |
   |                                   | 5. Gọi addRecord()            |
   |                                   |------------------------------->|
   |                                   |    (dùng ADMIN_PRIVATE_KEY)    |
```

**Bác sĩ ký khi nào?**

- Đăng nhập: Ký message bằng MetaMask
- Tạo lab order: Backend ký thay
- Thêm diễn giải: Backend ký thay
- Chốt hồ sơ: Backend ký thay

---

### Lab Tech

**Mỗi lab tech = 1 ví MetaMask**

```
Lab Tech                             Backend                         Blockchain
   |                                    |                                |
   | 1. Admin thêm lab tech             |                                |
   |----------------------------------->|                                |
   |                                    | 2. Gọi addLabTech()           |
   |                                    |------------------------------->|
   |                                    |    (dùng ADMIN_PRIVATE_KEY)    |
   |                                    |                                |
   | 3. Bệnh nhân cấp quyền            |                                |
   |                                    |                                |
   | 4. Lab tech tiếp nhận order       |                                |
   |----------------------------------->|                                |
   |                                    | 5. Gọi updateRecordStatus()   |
   |                                    |------------------------------->|
   |                                    |    (dùng ADMIN_PRIVATE_KEY)    |
   |                                    |                                |
   | 6. Lab tech post kết quả          |                                |
   |----------------------------------->|                                |
   |                                    | 7. Gọi postLabResult()        |
   |                                    |------------------------------->|
   |                                    |    (dùng ADMIN_PRIVATE_KEY)    |
```

---

## Tóm tắt: Ai ký giao dịch?

| Role | Đăng nhập | Ký giao dịch blockchain |
|------|----------|------------------------|
| **Admin** | nationId + password | Backend ký bằng ADMIN_PRIVATE_KEY |
| **Patient** | MetaMask (ký message) | Backend ký bằng ADMIN_PRIVATE_KEY |
| **Doctor** | MetaMask (ký message) | Backend ký bằng ADMIN_PRIVATE_KEY |
| **Lab Tech** | MetaMask (ký message) | Backend ký bằng ADMIN_PRIVATE_KEY |

**→ Tất cả giao dịch blockchain đều do backend ký bằng ADMIN_PRIVATE_KEY.**

**→ Người dùng (bệnh nhân, bác sĩ, lab tech) chỉ ký message khi đăng nhập (không tốn gas).**

---

## Vậy ví MetaMask của bệnh nhân/bác sĩ/lab tech dùng làm gì?

### 1. Xác định danh tính

- Mỗi ví = 1 tài khoản duy nhất trên blockchain
- Ví dùng để đăng ký role trên smart contract (registerPatient, addDoctor, addLabTech)

### 2. Kiểm soát quyền

- Bệnh nhân dùng ví để cấp quyền cho bác sĩ/lab tech
- Chỉ bệnh nhân sở hữu ví mới có thể consent, revoke

### 3. Đăng nhập

- Bệnh nhân/bác sĩ/lab tech ký message bằng MetaMask để chứng minh sở hữu ví
- Backend xác minh signature → cho phép đăng nhập

### 4. KHÔNG dùng để ký giao dịch

- Tất cả giao dịch do backend ký bằng ADMIN_PRIVATE_KEY
- Người dùng không cần lo về gas, nonce, v.v.

---

## Kết luận

| Thành phần | Chịu trách nhiệm | Không thể thay thế bằng |
|-----------|------------------|------------------------|
| `role = ADMIN` trong MongoDB | Đăng nhập hệ thống | Wallet address trên blockchain |
| `ADMIN_PRIVATE_KEY` trong .env | Ký giao dịch blockchain | Role ADMIN trong MongoDB |
| Ví deployer (mặc định admin) | Quyền admin trên smart contract | Bất kỳ ví nào khác (trừ addAdmin) |
| Ví MetaMask của bệnh nhân | Xác định danh tính + sở hữu dữ liệu | Bất kỳ ví nào khác |
| Ví MetaMask của bác sĩ | Xác định danh tính | Bất kỳ ví nào khác |
| Ví MetaMask của lab tech | Xác định danh tính | Bất kỳ ví nào khác |

**Tất cả thành phần phải ĐÚNG và ĐỦ thì hệ thống hoạt động bình thường.**
