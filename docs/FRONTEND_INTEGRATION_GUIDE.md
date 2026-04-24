# 📘 Hướng Dẫn Tích Hợp Frontend — EHR Blockchain System

> **Phiên bản:** 3.0 (Full API Reference)  
> **Cập nhật:** April 2026 — sau bug-fix audit  
> **Đối tượng:** Frontend Developers (React/Vue/Flutter)

---

## 📋 Mục lục

1. [Kiến trúc Tổng quan](#1-kiến-trúc-tổng-quan)
2. [Xác thực & JWT](#2-xác-thực--jwt)
3. [Pattern MetaMask Prepare/Confirm](#3-pattern-metamask-prepareconfirm)
4. [State Machine & Trạng thái](#4-state-machine--trạng-thái)
5. [API Chi tiết theo Màn hình](#5-api-chi-tiết-theo-màn-hình)
   - [5.1 Màn hình Đăng nhập / Đăng ký](#51-màn-hình-đăng-nhập--đăng-ký)
   - [5.2 Dashboard Admin](#52-dashboard-admin)
   - [5.3 Dashboard Bệnh nhân](#53-dashboard-bệnh-nhân)
   - [5.4 Dashboard Bác sĩ](#54-dashboard-bác-sĩ)
   - [5.5 Dashboard Kỹ thuật viên Lab](#55-dashboard-kỹ-thuật-viên-lab)
   - [5.6 Màn hình Chi tiết Lab Order](#56-màn-hình-chi-tiết-lab-order)
   - [5.7 Màn hình Hồ sơ bệnh án](#57-màn-hình-hồ-sơ-bệnh-án)
   - [5.8 Màn hình Quản lý quyền truy cập](#58-màn-hình-quản-lý-quyền-truy-cập)
6. [Xử lý Lỗi & Retry](#6-xử-lý-lỗi--retry)
7. [Gợi ý UI/UX theo Màn hình](#7-gợi-ý-uiux-theo-màn-hình)
8. [Phụ lục](#8-phụ-lục)

---

## 1. Kiến trúc Tổng quan

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Patient   │     │   Doctor    │     │  Lab Tech   │
│  (Mobile)   │     │  (Web/App)  │     │  (Web/App)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │  Bearer JWT + MetaMask
                           ▼
              ┌────────────────────────┐
              │    Backend API /v1     │
              │  (Node.js + MongoDB)   │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  Blockchain (Sepolia)  │
              │  EHRManager + Access   │
              └────────────────────────┘
```

**Base URL:** `https://api.yourdomain.com/v1`

**Auth header:** `Authorization: Bearer <accessToken>`

**Cookie:** `accessToken` (httpOnly, 20 phút), `refreshToken` (httpOnly, 14 ngày)

---

## 2. Xác thực & JWT

### 2.1 Đăng ký (Dành riêng cho Bệnh nhân)

> ⚠️ **Lưu ý quan trọng:** Hệ thống áp dụng mô hình "Ví là Danh tính". Bệnh nhân chỉ cần cung cấp `walletAddress` để đăng ký. Các trường thông tin khác là tùy chọn. Các role Bác sĩ và Lab Tech sẽ do Admin tạo trực tiếp.

```http
POST /v1/auth/register
Content-Type: application/json

{
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "email": "patient@example.com", (tùy chọn)
  "password": "SecurePass@123456", (tùy chọn)
  "nationId": "123456789012" (tùy chọn)
}
```

**Response 201:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "blockchainStatus": "NONE"
}
```

> 💡 **Registry API của Admin:** API đăng ký dành riêng cho Admin (`/v1/admins/auth/register`) đã bị **XÓA**. Admin chỉ có thể được khởi tạo qua script database hoặc migration nội bộ để đảm bảo bảo mật.

> ⚠️ **Trạng thái:** Sau khi đăng ký thành công, tài khoản Bệnh nhân ở trạng thái `PENDING`. Cần Admin duyệt (Approve) mới có thể đăng nhập và sử dụng hệ thống.

**Lỗi thường gặp:**
- `400` — Thiếu field (walletAddress là bắt buộc), password < 8 ký tự, wallet sai format.
- `409` — Email, NationId hoặc Wallet address đã tồn tại trong hệ thống.

---

### 2.2 Đăng nhập (Local — nationId + password)

```http
POST /v1/auth/login/nationId
Content-Type: application/json

{
  "nationId": "123456789012",
  "password": "SecurePass@123456"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "status": "ACTIVE",
  "hasProfile": true,
  "role": "PATIENT"
}
```

> Cookie `accessToken` và `refreshToken` cũng được set tự động (httpOnly).

**Lỗi thường gặp:**
- `401` — Sai mật khẩu
- `403` — Tài khoản PENDING/REJECTED/INACTIVE

---

### 2.3 Đăng nhập (Wallet / MetaMask — 2 bước)

**Bước 1 — Lấy nonce:**
```http
POST /v1/auth/login/wallet
Content-Type: application/json

{ "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB" }
```

**Response:**
```json
{ "nonce": "Login 1713000000000 - uuid..." }
```

**Bước 2 — Ký & gửi signature:**
```javascript
const signature = await window.ethereum.request({
  method: 'personal_sign',
  params: [nonce, walletAddress]
});
```

```http
POST /v1/auth/login/wallet
Content-Type: application/json

{
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "signature": "0x..."
}
```

**Response 200:** Trả về `accessToken`, `refreshToken`, `status`, `role`.

---

### 2.4 Làm mới token

```http
POST /v1/auth/refresh-token
```

→ Cookie `refreshToken` tự động gửi. Trả về `accessToken` mới.

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "status": "ACTIVE",
  "expiresIn": "20 minutes"
}
```

---

### 2.5 Đăng xuất

```http
DELETE /v1/auth/logout
Authorization: Bearer <accessToken>
```

→ Xóa cookie `accessToken` và `refreshToken`.

---

### 2.6 Đăng nhập Admin (endpoint riêng)

```http
POST /v1/admins/auth/login
Content-Type: application/json

{
  "nationId": "admin123456",
  "password": "AdminPass@123"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "role": "ADMIN"
}
```

> **Lưu ý:** Admin KHÔNG dùng `/v1/auth/login/nationId`. Phải dùng `/v1/admins/auth/login`.

---

## 3. Pattern MetaMask Prepare/Confirm

### 3.1 Nguyên tắc

Backend **KHÔNG** giữ private key. Mọi giao dịch blockchain đều do **frontend ký** qua MetaMask.

```
┌─────────┐    prepare (KHÔNG có txHash)    ┌─────────┐
│ Frontend│ ─────────────────────────────────> │ Backend │
│         │ <───────────────────────────────── │         │
│         │    { txRequest, action, details }  │         │
│         │                                    │         │
│         │  eth_sendTransaction (MetaMask)     │         │
│         │ ────────────> MetaMask ──────────>│ Blockchain
│         │                                    │         │
│         │  confirm (CÓ txHash)                │         │
│         │ ─────────────────────────────────> │         │
│         │ <───────────────────────────────── │         │
│         │    { success, status, data }       │         │
└─────────┘                                    └─────────┘
```

### 3.2 TypeScript Helper

```typescript
async function runMetaMaskFlow<TPrepare, TConfirm>(
  prepareUrl: string,
  confirmUrl: string,
  prepareBody: TPrepare,
  buildConfirmBody: (txHash: string) => TConfirm,
  token: string
) {
  // 1. Prepare — lấy txRequest
  const prepareRes = await api.post(prepareUrl, prepareBody, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const txRequest = prepareRes.data?.txRequest;
  if (!txRequest) throw new Error("Prepare thất bại: không có txRequest");

  // 2. Kiểm tra đúng chain
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId !== txRequest.chainId) {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: txRequest.chainId }]
    });
  }

  // 3. Ký & broadcast qua MetaMask
  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [txRequest]
  });

  // 4. Confirm với txHash
  const confirmBody = buildConfirmBody(txHash);
  return api.post(confirmUrl, confirmBody, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

### 3.3 Quy tắc vàng

| Quy tắc | Giải thích |
|---------|-----------|
| **Không mutate payload** | Giữ nguyên body prepare, chỉ thêm `txHash` khi confirm |
| **Khóa nút submit** | Disable button trong lúc chờ MetaMask, tránh double submit |
| **User reject (4001)** | Giữ form, cho phép retry |
| **Tx pending lâu** | Hiển thị "Tôi đã ký, thử confirm lại" với cùng `txHash` |
| **Lưu pending context** | Dùng sessionStorage để recover khi user reload giữa prepare và confirm |

---

## 4. State Machine & Trạng thái

### 4.1 Lab Order Status (on-chain + DB)

```
ORDERED ──consent──> CONSENTED ──receive──> IN_PROGRESS ──post result──> RESULT_POSTED ──interpret──> DOCTOR_REVIEWED ──complete──> COMPLETE
   │                    │                      │                              │
   └─cancel/delete    └─cancel              └─cancel                     └─cancel (nếu chưa complete)
```

| Trạng thái | Ai thao tác | API | Giao dịch blockchain |
|------------|-------------|-----|---------------------|
| `ORDERED` | Bác sĩ tạo | `POST /lab-orders` → `POST /lab-orders/confirm` | ✅ Có |
| `CONSENTED` | Bệnh nhân đồng ý | `PATCH /lab-orders/:id/consent` → `.../confirm` | ✅ Có |
| `IN_PROGRESS` | Lab tech tiếp nhận | `PATCH /lab-orders/:id/receive` → `.../confirm` | ✅ Có |
| `RESULT_POSTED` | Lab tech nhập kết quả | `PATCH /lab-orders/:id/post-result` → `.../confirm` | ✅ Có |
| `DOCTOR_REVIEWED` | Bác sĩ diễn giải | `PATCH /lab-orders/:id/interpretation` → `.../confirm` | ✅ Có |
| `COMPLETE` | Bác sĩ chốt hồ sơ | `PATCH /lab-orders/:id/complete` → `.../confirm` | ✅ Có |
| `CANCELLED` | Bác sĩ hủy | `PATCH /lab-orders/:id/cancel` | ❌ Không |

### 4.2 Medical Record Status (DB — off-chain)

```
CREATED ──tạo lab order──> WAITING_RESULT ──lab post result──> HAS_RESULT ──bác sĩ interpret──> DIAGNOSED ──complete──> COMPLETE
   │                                                                                          │
   └─direct complete (không cần lab)                                                          └─direct complete
```

| Trạng thái | Ý nghĩa |
|------------|---------|
| `CREATED` | Bác sĩ vừa tạo hồ sơ khám |
| `WAITING_RESULT` | Đã tạo lab order, chờ kết quả |
| `HAS_RESULT` | Lab đã post kết quả |
| `DIAGNOSED` | Bác sĩ đã review & chẩn đoán |
| `COMPLETE` | Hồ sơ hoàn tất |

> ⚠️ **1 bệnh nhân = 1 hồ sơ ACTIVE** (CREATED/WAITING_RESULT/HAS_RESULT/DIAGNOSED). Phải `COMPLETE` trước khi tạo hồ sơ mới.

---

## 5. API Chi tiết theo Màn hình

### 5.1 Màn hình Đăng nhập / Đăng ký

#### Màn hình: Đăng ký tài khoản

```http
POST /v1/auth/register
```

**Body:**
```json
{
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "email": "patient@example.com", (tùy chọn)
  "password": "SecurePass@123456", (tùy chọn)
  "nationId": "123456789012" (tùy chọn)
}
```

**Validation:**
- `walletAddress`: `0x` + 40 ký tự hex (BẮT BUỘC)
- `email`: tùy chọn, format email
- `password`: tùy chọn, tối thiểu 8 ký tự
- `nationId`: tùy chọn, 9 hoặc 12 chữ số

**Response 201:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "blockchainStatus": "NONE"
}
```

**UX:** Hiển thị "Đăng ký thành công — chờ admin duyệt".

---

#### Màn hình: Đăng nhập (Patient/Doctor/LabTech)

```http
POST /v1/auth/login/nationId
```

**Body:**
```json
{
  "nationId": "123456789012",
  "password": "SecurePass@123456"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "status": "ACTIVE",
  "hasProfile": true,
  "role": "PATIENT"
}
```

**UX:**
- Lưu `accessToken` vào memory (Redux/Zustand/Context).
- Nếu `status === "PENDING"`: redirect "Chờ duyệt".
- Nếu `status === "REJECTED"`: hiển thị lý do, không cho vào app.
- Nếu `hasProfile === false` && `role === "PATIENT"`: redirect tạo profile.

---

#### Màn hình: Đăng nhập Admin

```http
POST /v1/admins/auth/login
```

**Body:**
```json
{
  "nationId": "admin123456",
  "password": "AdminPass@123"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "role": "ADMIN"
}
```

---

#### Màn hình: Đăng nhập bằng MetaMask

**Bước 1:**
```http
POST /v1/auth/login/wallet
{ "walletAddress": "0x..." }
```
→ Response: `{ "nonce": "Login 1713000000000 - ..." }`

**Bước 2 (Frontend):**
```javascript
const signature = await window.ethereum.request({
  method: 'personal_sign',
  params: [nonce, walletAddress]
});
```

**Bước 3:**
```http
POST /v1/auth/login/wallet
{ "walletAddress": "0x...", "signature": "0x..." }
```

---

### 5.2 Dashboard Admin

#### Màn hình: Danh sách chờ duyệt

```http
GET /v1/admins/users?status=PENDING&page=1&limit=10
Authorization: Bearer <adminToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "507f...",
      "email": "patient@example.com",
      "nationId": "123456789012",
      "walletAddress": "0xED95...",
      "status": "PENDING",
      "role": "PATIENT",
      "createdAt": "2026-04-08T10:00:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10
}
```

**Query params:**
- `status`: `PENDING` | `ACTIVE` | `REJECTED` | `INACTIVE`
- `page`: số trang (mặc định 1)
- `limit`: số lượng mỗi trang (mặc định 10)
- `deleted`: `true` để xem đã xóa mềm

---

#### Màn hình: Duyệt / Từ chối user

**Duyệt (Prepare):**
```http
POST /v1/admins/users/:id/approve/prepare
Authorization: Bearer <adminToken>
```

**Response 200 (Prepare):**
```json
{
  "message": "Transaction prepared",
  "txRequest": {
    "to": "0xAccountManager...",
    "data": "0x...",
    "chainId": "0xaa36a7",
    ...
  }
}
```

**Duyệt (Confirm):**
```http
POST /v1/admins/users/:id/approve/confirm
Authorization: Bearer <adminToken>
Content-Type: application/json

{ "txHash": "0xabc123..." }
```

**Response 200 (Confirm):**
```json
{
  "message": "Người dùng được duyệt thành công",
  "userId": "507f...",
  "status": "ACTIVE"
}
```

**Từ chối:**
```http
PATCH /v1/admins/users/:id/reject
Authorization: Bearer <adminToken>
Content-Type: application/json

{ "reason": "Thông tin CMND không hợp lệ" }
```

**Response 200:**
```json
{
  "message": "User đã bị từ chối",
  "userId": "507f...",
  "status": "REJECTED",
  "rejectionReason": "Thông tin CMND không hợp lệ"
}
```

**Phục hồi xét duyệt lại:**
```http
PATCH /v1/admins/users/:id/re-review
Authorization: Bearer <adminToken>
```

---

#### Màn hình: Verify CMND

```http
PATCH /v1/admins/users/:id/verify-id
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "isVerified": true,
  "notes": "CMND hợp lệ, thông tin match"
}
```

---

#### Màn hình: Tạo tài khoản Bác sĩ / Lab Tech (MetaMask prepare/confirm)

**Tạo Bác sĩ — Prepare:**
```http
POST /v1/admins/users/create-doctor
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "email": "doctor@hospital.com",
  "password": "SecurePassword123",
  "nationId": "123456789",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D"
}
```

**Response 200 (Prepare):**
```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "ADMIN_ADD_DOCTOR",
  "txRequest": {
    "to": "0xAccountManager...",
    "data": "0x...",
    "value": "0",
    "chainId": "0xaa36a7",
    "from": "0x...",
    "gasLimit": 300000,
    "gasPrice": "20000000000",
    "nonce": 12
  },
  "details": {
    "email": "doctor@hospital.com",
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D"
  }
}
```

**Tạo Bác sĩ — Confirm:**
```http
POST /v1/admins/users/create-doctor/confirm
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "email": "doctor@hospital.com",
  "password": "SecurePassword123",
  "nationId": "123456789",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D",
  "txHash": "0xabc123def456..."
}
```

**Response 201:**
```json
{
  "message": "Tài khoản bác sĩ đã được tạo thành công",
  "userId": "507f...",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D"
}
```

**Tạo Lab Tech:** Tương tự, dùng `POST /v1/admins/users/create-labtech` và `.../confirm`.

---

#### Màn hình: Xóa mềm user

```http
PATCH /v1/admins/users/:id/soft-delete
Authorization: Bearer <adminToken>
```

Hoặc:
```http
DELETE /v1/admins/users/:id/soft-delete
Authorization: Bearer <adminToken>
```

**Response 200:**
```json
{
  "message": "User đã được đánh dấu xóa mềm",
  "userId": "507f..."
}
```

---

### 5.3 Dashboard Bệnh nhân

#### Màn hình: Tạo hồ sơ bệnh nhân (nếu chưa có)

```http
POST /v1/patients
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "phoneNumber": "0912345678",
  "fullName": "Nguyễn Văn A",
  "gender": "M",
  "dob": 946684800000
}
```

**Response 201:**
```json
{
  "id": "69ba902193958774013b93e9",
  "userId": "69b8ebdde2fbbfead81f3502",
  "fullName": "Nguyễn Văn A",
  "gender": "M",
  "birthYear": 2000,
  "phoneNumber": "0912345678",
  "createdAt": "2026-03-18T11:44:33.337Z"
}
```

---

#### Màn hình: Xem hồ sơ của tôi

```http
GET /v1/patients/me
Authorization: Bearer <patientToken>
```

**Response 200:**
```json
{
  "id": "69ba902193958774013b93e9",
  "userId": "69b8ebdde2fbbfead81f3502",
  "fullName": "Nguyễn Văn A",
  "gender": "M",
  "birthYear": 2000,
  "phoneNumber": "0912345678",
  "createdAt": "2026-03-18T11:44:33.337Z"
}
```

---

#### Màn hình: Dashboard — Sức khỏe của tôi

**Lấy danh sách records:**
```http
GET /v1/patient-records
Authorization: Bearer <patientToken>
```

**Response 200:**
```json
[
  {
    "recordId": "1",
    "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "author": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "recordType": 2,
    "status": 5,
    "orderHash": "0xabc123...",
    "labResultHash": "0xdef456...",
    "interpretationHash": "0x789abc...",
    "createdAt": 1711500000
  }
]
```

> `recordType`: 0=GENERAL, 1=HIV_TEST, 2=DIABETES_TEST, 3=LAB_RESULT  
> `status`: 0=ORDERED, 1=CONSENTED, 2=IN_PROGRESS, 3=RESULT_POSTED, 4=DOCTOR_REVIEWED, 5=COMPLETE

---

#### Màn hình: Xem chi tiết record

```http
GET /v1/patient-records/:recordId
Authorization: Bearer <patientToken>
```

**Response 200:**
```json
{
  "recordId": "1",
  "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "author": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "recordType": 2,
  "status": 5,
  "orderHash": "0xabc123...",
  "orderData": {
    "recordType": "DIABETES_TEST",
    "testsRequested": [{ "code": "GLUCOSE", "name": "Đường huyết lúc đói" }],
    "clinicalNote": "Theo dõi đường huyết"
  },
  "labResultHash": "0xdef456...",
  "labResultData": {
    "rawData": { "glucose": 145, "hba1c": 7.2 },
    "note": "Glucose và HbA1c cao"
  },
  "interpretationHash": "0x789abc...",
  "interpretationData": {
    "interpretation": "Kết quả cho thấy tiểu đường type 2",
    "recommendation": "Điều chỉnh chế độ ăn, tăng vận động"
  },
  "verification": {
    "orderHashValid": true,
    "labResultHashValid": true,
    "interpretationHashValid": true
  }
}
```

---

#### Màn hình: Verify hash (Kiểm tra toàn vẹn dữ liệu)

```http
POST /v1/patient-records/verify
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "recordId": "1",
  "hashType": 1
}
```

> `hashType`: 0=orderHash, 1=labResultHash, 2=interpretationHash

**Response 200:**
```json
{
  "isValid": true,
  "recordId": "1",
  "hashType": 1,
  "offChainHash": "0xabc...",
  "note": "Dữ liệu Off-chain khớp hoàn toàn với Blockchain"
}
```

---

#### Màn hình: Danh sách lab orders của tôi

```http
GET /v1/lab-orders?status=ORDERED&page=1&limit=10
Authorization: Bearer <patientToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6801a2b3c4d5e6f789012345",
      "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "recordType": "DIABETES_TEST",
      "status": "ORDERED",
      "testsRequested": [{ "code": "GLUCOSE", "name": "Đường huyết lúc đói" }],
      "createdAt": "2026-04-08T14:35:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

---

#### Màn hình: Đồng ý xét nghiệm (Consent)

**Prepare:**
```http
PATCH /v1/lab-orders/:id/consent
Authorization: Bearer <patientToken>
```

**Response 200 (Prepare):**
```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "CONSENT_LAB_ORDER",
  "txRequest": { "to": "0x...", "data": "0x...", "value": "0", "chainId": "0xaa36a7" }
}
```

**Confirm:**
```http
PATCH /v1/lab-orders/:id/consent/confirm
Authorization: Bearer <patientToken>
Content-Type: application/json

{ "txHash": "0xabc123def456..." }
```

---

### 5.4 Dashboard Bác sĩ

#### Màn hình: Worklist — Bệnh nhân cần xử lý

```http
GET /v1/doctors/medical-records?status=HAS_RESULT,WAITING_RESULT&page=1&limit=10
Authorization: Bearer <doctorToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6801a2b3c4d5e6f789012345",
      "patientId": "69ba902193958774013b93e9",
      "status": "HAS_RESULT",
      "chief_complaint": "Đau đầu 3 ngày",
      "diagnosis": "Nghi tiểu đường type 2",
      "createdAt": "2026-04-08T14:30:00Z",
      "patientName": "Nguyễn Văn A"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 10
}
```

> Query `status` có thể là: `CREATED`, `WAITING_RESULT`, `HAS_RESULT`, `DIAGNOSED`, `COMPLETE`.

---

#### Màn hình: Xem chi tiết hồ sơ bệnh án

```http
GET /v1/doctors/medical-records/:medicalRecordId
Authorization: Bearer <doctorToken>
```

**Response 200:**
```json
{
  "_id": "6801a2b3c4d5e6f789012345",
  "patientId": "69ba902193958774013b93e9",
  "createdBy": "507f...",
  "status": "HAS_RESULT",
  "chief_complaint": "Đau đầu 3 ngày",
  "vital_signs": { "temperature": 36.5, "blood_pressure": "120/80", "heart_rate": 72 },
  "physical_exam": { "general": "Bệnh nhân tỉnh táo", "head": "Không bất thường" },
  "assessment": "Nghi tiểu đường type 2",
  "plan": "Chỉ định xét nghiệm HbA1c, glucose",
  "diagnosis": "Nghi tiểu đường type 2",
  "confirmedDiagnosis": null,
  "relatedLabOrderIds": ["6801a2b3c4d5e6f789012346"],
  "createdAt": "2026-04-08T14:30:00Z",
  "updatedAt": "2026-04-08T15:00:00Z"
}
```

> Backend tự động verify quyền truy cập qua blockchain (`checkAccessLevel`). Nếu không có quyền → `403`.

---

#### Màn hình: Danh sách bệnh nhân

```http
GET /v1/doctors/patients?page=1&limit=10
Authorization: Bearer <doctorToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69ba902193958774013b93e9",
      "fullName": "Nguyễn Văn A",
      "gender": "M",
      "birthYear": 2000,
      "phoneNumber": "0912345678"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

---

#### Màn hình: Xem chi tiết bệnh nhân

```http
GET /v1/doctors/patients/:patientId
Authorization: Bearer <doctorToken>
```

**Response 200:**
```json
{
  "_id": "69ba902193958774013b93e9",
  "userId": "69b8ebdde2fbbfead81f3502",
  "fullName": "Nguyễn Văn A",
  "gender": "M",
  "birthYear": 2000,
  "phoneNumber": "0912345678",
  "createdAt": "2026-03-18T11:44:33.337Z"
}
```

---

#### Màn hình: Lịch sử hồ sơ bệnh nhân

```http
GET /v1/doctors/patients/:patientId/medical-records?status=COMPLETE&page=1&limit=10
Authorization: Bearer <doctorToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6801a2b3c4d5e6f789012345",
      "status": "COMPLETE",
      "chief_complaint": "Đau đầu 3 ngày",
      "confirmedDiagnosis": "Tiểu đường type 2 (confirmed by HbA1c 7.2%)",
      "createdAt": "2026-04-08T14:30:00Z",
      "completedAt": "2026-04-08T16:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 10
}
```

---

#### Màn hình: Tạo hồ sơ khám mới

```http
POST /v1/doctors/patients/:patientId/medical-records
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "chief_complaint": "Đau đầu 3 ngày",
  "vital_signs": {
    "temperature": 36.5,
    "blood_pressure": "120/80",
    "heart_rate": 72,
    "respiratory_rate": 16
  },
  "physical_exam": {
    "general": "Bệnh nhân tỉnh táo",
    "head": "Không bất thường",
    "cardiovascular": "Nhịp tim đều"
  },
  "assessment": "Nghi tiểu đường type 2",
  "plan": "Chỉ định xét nghiệm HbA1c, glucose",
  "diagnosis": "Nghi tiểu đường type 2"
}
```

**Response 201:**
```json
{
  "medicalRecordId": "6801a2b3c4d5e6f789012345",
  "status": "CREATED",
  "chief_complaint": "Đau đầu 3 ngày",
  "diagnosis": "Nghi tiểu đường type 2",
  "message": "Tạo hồ sơ bệnh án thành công"
}
```

> ⚠️ **Lưu ý:** Không thể tạo nếu bệnh nhân đang có hồ sơ ACTIVE (CREATED/WAITING_RESULT/HAS_RESULT/DIAGNOSED).

---

#### Màn hình: Tạo lab order (MetaMask prepare/confirm)

**Prepare:**
```http
POST /v1/lab-orders
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "medicalRecordId": "6801a2b3c4d5e6f789012345",
  "recordType": "DIABETES_TEST",
  "assignedLabTech": "6851b2c3d4e5f6a789012365",
  "testsRequested": [
    { "code": "GLUCOSE", "name": "Đường huyết lúc đói", "note": "Nhịn ăn 8 tiếng" },
    { "code": "HBA1C", "name": "Hemoglobin A1c" }
  ],
  "priority": "normal",
  "clinicalNote": "Theo dõi đường huyết bệnh nhân tiểu đường type 2",
  "sampleType": "blood",
  "diagnosisCode": "E11.9"
}
```

**Response 200 (Prepare):**
```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "CREATE_LAB_ORDER",
  "txRequest": {
    "to": "0xEHRManager...",
    "data": "0x...",
    "value": "0",
    "chainId": "0xaa36a7",
    "from": "0x...",
    "gasLimit": 300000,
    "gasPrice": "20000000000",
    "nonce": 12
  },
  "details": {
    "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "recordType": "DIABETES_TEST",
    "testsRequested": [...]
  }
}
```

**Confirm:**
```http
POST /v1/lab-orders/confirm
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "medicalRecordId": "6801a2b3c4d5e6f789012345",
  "recordType": "DIABETES_TEST",
  "assignedLabTech": "6851b2c3d4e5f6a789012365",
  "testsRequested": [...],
  "priority": "normal",
  "clinicalNote": "Theo dõi đường huyết...",
  "sampleType": "blood",
  "diagnosisCode": "E11.9",
  "txHash": "0xabc123def456..."
}
```

**Response 201:**
```json
{
  "message": "Tạo lab order thành công",
  "labOrderId": "6801a2b3c4d5e6f789012346",
  "blockchainRecordId": "1",
  "status": "ORDERED",
  "txHash": "0xabc123def456..."
}
```

---

#### Màn hình: Phân công lab tech

```http
POST /v1/lab-orders/assign
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "labOrderId": "6801a2b3c4d5e6f789012346",
  "labTechId": "6851b2c3d4e5f6a789012365"
}
```

**Response 200:**
```json
{
  "message": "Phân công order thành công",
  "orderId": "6801a2b3c4d5e6f789012346",
  "assignedLabTech": {
    "id": "6851b2c3d4e5f6a789012365",
    "name": "Nguyễn Thị B",
    "email": "lab_tech_b@example.com"
  },
  "sampleStatus": "CONSENTED"
}
```

> Chỉ phân công khi `status === "CONSENTED"` và `assignedLabTech === null`.

---

#### Màn hình: Thêm diễn giải lâm sàng (MetaMask prepare/confirm)

**Prepare:**
```http
PATCH /v1/lab-orders/:id/interpretation
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "interpretation": "Glucose 145 mg/dL (cao), HbA1c 7.2% (cao). Kết quả cho thấy bệnh nhân bị tiểu đường type 2, kiểm soát đường huyết chưa tốt.",
  "recommendation": "1. Điều chỉnh chế độ ăn: giảm tinh bột, tăng rau xanh. 2. Tăng cường vận động 30 phút/ngày. 3. Tái khám sau 3 tháng.",
  "confirmedDiagnosis": "Tiểu đường type 2 (confirmed by HbA1c 7.2%)",
  "interpreterNote": "Bệnh nhân cần theo dõi sát"
}
```

> `confirmedDiagnosis` là **bắt buộc**. Đây là chẩn đoán cuối cùng sau khi xem kết quả lab.

**Confirm:**
```http
PATCH /v1/lab-orders/:id/interpretation/confirm
Authorization: Bearer <doctorToken>
Content-Type: application/json

{
  "interpretation": "...",
  "recommendation": "...",
  "confirmedDiagnosis": "Tiểu đường type 2 (confirmed by HbA1c 7.2%)",
  "interpreterNote": "...",
  "txHash": "0xabc123def456..."
}
```

---

#### Màn hình: Chốt hồ sơ (Complete — MetaMask prepare/confirm)

**Prepare:**
```http
PATCH /v1/lab-orders/:id/complete
Authorization: Bearer <doctorToken>
```

**Confirm:**
```http
PATCH /v1/lab-orders/:id/complete/confirm
Authorization: Bearer <doctorToken>
Content-Type: application/json

{ "txHash": "0xabc123def456..." }
```

---

#### Màn hình: Hoàn thành hồ sơ trực tiếp (không cần lab)

```http
POST /v1/doctors/medical-records/:medicalRecordId/complete
Authorization: Bearer <doctorToken>
```

> Không cần MetaMask. Chỉ dùng khi `status === "CREATED"` hoặc `"DIAGNOSED"`, và hồ sơ **không có** lab order liên quan.

**Response 200:**
```json
{
  "message": "Hoàn thành hồ sơ bệnh án thành công (không có xét nghiệm)",
  "medicalRecordId": "6801a2b3c4d5e6f789012345",
  "status": "COMPLETE",
  "diagnosis": "Viêm họng cấp",
  "completedAt": "2026-04-08T16:00:00Z",
  "flowType": "DIRECT_COMPLETE_NO_LAB_ORDER"
}
```

---

#### Màn hình: Xóa lab order

```http
DELETE /v1/lab-orders/:labOrderId
Authorization: Bearer <doctorToken>
```

> Chỉ xóa được khi `status === "ORDERED"`. Tự động remove khỏi `medicalRecord.relatedLabOrderIds`.

**Response 200:**
```json
{
  "success": true,
  "message": "Lab order 6801a2b3c4d5e6f789012346 đã xóa thành công",
  "deletedLabOrderId": "6801a2b3c4d5e6f789012346",
  "cleanedFromMedicalRecordId": "6801a2b3c4d5e6f789012345"
}
```

---

#### Màn hình: Hủy lab order

```http
PATCH /v1/lab-orders/:labOrderId/cancel
Authorization: Bearer <doctorToken>
Content-Type: application/json

{ "reason": "Bệnh nhân không đồng ý" }
```

> Hủy được ở **mọi trạng thái** (trừ COMPLETE và CANCELLED). Giữ lại record để lịch sử.

**Response 200:**
```json
{
  "success": true,
  "message": "Lab order 6801a2b3c4d5e6f789012346 đã cancel thành công",
  "cancelledLabOrderId": "6801a2b3c4d5e6f789012346",
  "previousStatus": "ORDERED",
  "newStatus": "CANCELLED",
  "reason": "Bệnh nhân không đồng ý"
}
```

---

### 5.5 Dashboard Kỹ thuật viên Lab

#### Màn hình: Danh sách cần làm

```http
GET /v1/lab-orders?status=CONSENTED&page=1&limit=10
Authorization: Bearer <labTechToken>
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6801a2b3c4d5e6f789012346",
      "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "recordType": "DIABETES_TEST",
      "status": "CONSENTED",
      "testsRequested": [
        { "code": "GLUCOSE", "name": "Đường huyết lúc đói" },
        { "code": "HBA1C", "name": "Hemoglobin A1c" }
      ],
      "priority": "normal",
      "sampleType": "blood",
      "createdAt": "2026-04-08T14:35:00Z",
      "assignedLabTech": "6851b2c3d4e5f6a789012365"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 10
}
```

> Lab tech chỉ thấy orders được **phân công cho mình** (`assignedLabTech === myUserId`).

---

#### Màn hình: Tiếp nhận order (MetaMask prepare/confirm)

**Prepare:**
```http
PATCH /v1/lab-orders/:id/receive
Authorization: Bearer <labTechToken>
```

**Confirm:**
```http
PATCH /v1/lab-orders/:id/receive/confirm
Authorization: Bearer <labTechToken>
Content-Type: application/json

{ "txHash": "0xabc123def456..." }
```

---

#### Màn hình: Nhập kết quả xét nghiệm (MetaMask prepare/confirm)

**Prepare:**
```http
PATCH /v1/lab-orders/:id/post-result
Authorization: Bearer <labTechToken>
Content-Type: application/json

{
  "rawData": {
    "glucose": 145,
    "hba1c": 7.2,
    "unit": "mg/dL"
  },
  "note": "Glucose và HbA1c đều cao hơn bình thường, gợi ý tiểu đường type 2"
}
```

**Confirm:**
```http
PATCH /v1/lab-orders/:id/post-result/confirm
Authorization: Bearer <labTechToken>
Content-Type: application/json

{
  "rawData": { "glucose": 145, "hba1c": 7.2, "unit": "mg/dL" },
  "note": "Glucose và HbA1c đều cao hơn bình thường...",
  "txHash": "0xabc123def456..."
}
```

> Kết quả bị **LOCK** ngay sau khi post. Không ai sửa được (kể cả bác sĩ hay admin).

---

### 5.6 Màn hình Chi tiết Lab Order

#### Xem chi tiết (tất cả roles)

```http
GET /v1/lab-orders/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "_id": "6801a2b3c4d5e6f789012346",
  "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "doctorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "recordType": "DIABETES_TEST",
  "status": "DOCTOR_REVIEWED",
  "testsRequested": [...],
  "priority": "normal",
  "clinicalNote": "Theo dõi đường huyết...",
  "sampleType": "blood",
  "diagnosisCode": "E11.9",
  "assignedLabTech": "6851b2c3d4e5f6a789012365",
  "labResultHash": "0xdef456...",
  "labResultIpfsHash": "QmXxxx...",
  "interpretationHash": "0x789abc...",
  "blockchainRecordId": "1",
  "txHash": "0xabc123...",
  "createdAt": "2026-04-08T14:35:00Z",
  "updatedAt": "2026-04-08T16:00:00Z"
}
```

> Role-based access: Patient chỉ xem order của mình. Doctor xem order do mình tạo. Lab tech xem order được phân công.

---

### 5.7 Màn hình Hồ sơ bệnh án

#### Xem danh sách (tất cả roles)

```http
GET /v1/lab-orders?status=COMPLETE&page=1&limit=10
Authorization: Bearer <token>
```

> Query `status` hỗ trợ: `ORDERED`, `CONSENTED`, `IN_PROGRESS`, `RESULT_POSTED`, `DOCTOR_REVIEWED`, `COMPLETE`.

---

### 5.8 Màn hình Quản lý quyền truy cập

#### Màn hình: Cấp quyền cho bác sĩ (MetaMask prepare/confirm)

**Prepare:**
```http
POST /v1/access-control/grant
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "FULL",
  "expiresAt": 1720000000
}
```

> `level`: `FULL` (xem/phục vụ nghiệp vụ chuẩn) hoặc `SENSITIVE` (dữ liệu nhạy cảm như HIV).  
> `expiresAt`: Unix timestamp (ưu tiên hơn `durationHours`).  
> `durationHours`: 0 = vĩnh viễn, 168 = 7 ngày.

**Response 200 (Prepare):**
```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "GRANT_ACCESS",
  "txRequest": { "to": "0xAccessControl...", "data": "0x...", "value": "0", "chainId": "0xaa36a7" }
}
```

**Confirm:**
```http
POST /v1/access-control/grant/confirm
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "FULL",
  "expiresAt": 1720000000,
  "txHash": "0xabc123def456..."
}
```

---

#### Màn hình: Cập nhật quyền

**Prepare:**
```http
PATCH /v1/access-control/update
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "SENSITIVE",
  "expiresAt": 1720000000
}
```

**Confirm:**
```http
PATCH /v1/access-control/update/confirm
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "SENSITIVE",
  "expiresAt": 1720000000,
  "txHash": "0xabc123def456..."
}
```

---

#### Màn hình: Thu hồi quyền

**Prepare:**
```http
POST /v1/access-control/revoke
Authorization: Bearer <patientToken>
Content-Type: application/json

{ "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" }
```

**Confirm:**
```http
POST /v1/access-control/revoke/confirm
Authorization: Bearer <patientToken>
Content-Type: application/json

{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "txHash": "0xabc123def456..."
}
```

---

#### Màn hình: Kiểm tra quyền

```http
POST /v1/access-control/check
Authorization: Bearer <token>
Content-Type: application/json

{
  "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "requiredLevel": "FULL"
}
```

**Response 200:**
```json
{ "hasAccess": true }
```

---

#### Màn hình: Xem thông tin quyền

```http
POST /v1/access-control/grant-info
Authorization: Bearer <token>
Content-Type: application/json

{
  "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
}
```

**Response 200:**
```json
{
  "level": 2,
  "grantedAt": 1711500000,
  "expiresAt": 1720000000,
  "isActive": true
}
```

> `level`: 0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE

---

#### Màn hình: Danh sách người được cấp quyền

```http
GET /v1/access-control/my-grants?page=1&limit=50
Authorization: Bearer <patientToken>
```

**Response 200:**
```json
{
  "code": 200,
  "message": "Lấy danh sách quyền truy cập thành công",
  "grants": [
    {
      "accessor": "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      "level": 2,
      "levelName": "FULL",
      "grantedAt": 1711500000,
      "expiresAt": 0,
      "isExpired": false,
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 3,
    "totalPages": 1
  }
}
```

---

## 6. Xử lý Lỗi & Retry

### 6.1 HTTP Status Codes

| Code | Ý nghĩa | Hành động UX |
|------|---------|-------------|
| `200/201` | Thành công | Hiển thị kết quả |
| `400` | Payload sai / sai state transition | Hiển thị lỗi từ backend, giữ form |
| `401` | Token hết hạn | Tự động refresh token 1 lần, retry request |
| `403` | Sai role / tx signer không đúng | Chặn thao tác, hiển thị "Không có quyền" |
| `404` | Không tìm thấy entity / tx | Refresh danh sách, kiểm tra ID |
| `409` | Conflict / tx chưa confirm / race | Nút "Thử lại" hoặc reload trạng thái |
| `422` | Validation error | Hiển thị lỗi field cụ thể |

### 6.2 MetaMask Error Codes

| Code | Ý nghĩa | Hành động |
|------|---------|-----------|
| `4001` | User reject ký | Giữ form, cho phép retry |
| `-32603` | Internal error / nonce conflict | Gọi lại prepare để lấy tx mới |
| `4100` | Unauthorized (sai chain) | Switch chain rồi retry |

### 6.3 Axios Interceptor mẫu

```typescript
import axios from 'axios';

const api = axios.create({ baseURL: 'https://api.yourdomain.com/v1' });

// Request interceptor — thêm token
api.interceptors.request.use((config) => {
  const token = getAccessToken(); // từ memory (Redux/Zustand)
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — xử lý 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        await api.post('/auth/refresh-token'); // cookie auto-sent
        return api(original); // retry request cũ
      } catch (refreshErr) {
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }
    
    return Promise.reject(err);
  }
);
```

---

## 7. Gợi ý UI/UX theo Màn hình

### 7.1 Patient App

```
┌─────────────────────────────────────────┐
│        👤 Sức khỏe của tôi             │
├─────────────────────────────────────────┤
│                                         │
│  ⚠️ Cần hành động                       │
│  └─ [Bác sĩ A] yêu cầu xét nghiệm máu  │
│     [Xem chi tiết] [Đồng ý] [Từ chối] │
│                                         │
│  📋 Hồ sơ khám bệnh                     │
│  ├─ 15/04: Khám tổng quát — COMPLETE   │
│  └─ 10/04: Xét nghiệm đường huyết...    │
│                                         │
│  🔐 Quyền truy cập                      │
│  └─ 2 bác sĩ đang có quyền              │
│     [Xem] [Thu hồi]                     │
│                                         │
└─────────────────────────────────────────┘
```

**Button enable logic:**
- `[Đồng ý xét nghiệm]`: `labOrder.status === 'ORDERED'`
- `[Thu hồi quyền]`: `grant.isActive === true`

---

### 7.2 Doctor Dashboard

```
┌─────────────────────────────────────────┐
│         👨‍⚕️ Bác sĩ — Worklist           │
├─────────────────────────────────────────┤
│                                         │
│  🔴 Cần diễn giải (HAS_RESULT)          │
│  ├─ [BN Nguyễn Văn A] — Glucose cao    │
│  └─ [BN Trần Thị B] — HbA1c 7.2%       │
│                                         │
│  🟡 Đang chờ kết quả (WAITING_RESULT)   │
│  ├─ [BN Lê Văn C] — Xét nghiệm máu     │
│  └─ [BN Phạm Thị D] — Xét nghiệm nước  │
│                                         │
│  🟢 Hoàn thành hôm nay                 │
│  └─ 5 hồ sơ                            │
│                                         │
│  [+ Tạo hồ sơ mới]                     │
│                                         │
└─────────────────────────────────────────┘
```

**Button enable logic:**
- `[Diễn giải]`: `labOrder.status === 'RESULT_POSTED'`
- `[Chốt hồ sơ]`: `labOrder.status === 'DOCTOR_REVIEWED'`
- `[Direct Complete]`: `medicalRecord.status === 'CREATED' && hasDiagnosis && noLabOrders`

---

### 7.3 Lab Tech Dashboard

```
┌─────────────────────────────────────────┐
│         🧪 Kỹ thuật viên               │
├─────────────────────────────────────────┤
│                                         │
│  🔴 Cần tiếp nhận (CONSENTED)           │
│  └─ [BN Nguyễn Văn A] — Đường huyết    │
│     [Tiếp nhận]                        │
│                                         │
│  🟡 Đang xử lý (IN_PROGRESS)            │
│  ├─ [BN Trần Thị B] — HbA1c            │
│  └─ [BN Lê Văn C] — Công thức máu      │
│     [Nhập kết quả]                     │
│                                         │
│  🟢 Đã nhập kết quả (RESULT_POSTED)     │
│  └─ 12 orders                           │
│                                         │
└─────────────────────────────────────────┘
```

**Button enable logic:**
- `[Tiếp nhận]`: `labOrder.status === 'CONSENTED' && assignedToMe`
- `[Nhập kết quả]`: `labOrder.status === 'IN_PROGRESS' && assignedToMe`

---

### 7.4 Admin Dashboard

```
┌─────────────────────────────────────────┐
│         🛡️ Quản trị viên              │
├─────────────────────────────────────────┤
│                                         │
│  📋 Chờ duyệt (PENDING)                 │
│  ├─ [Nguyễn Văn A] — Patient           │
│  └─ [Trần Thị B] — Patient              │
│     [Duyệt] [Từ chối] [Xem CMND]      │
│                                         │
│  👨‍⚕️ Quản lý Bác sĩ / Lab Tech          │
│  └─ [Tạo tài khoản mới]                │
│                                         │
│  🔗 Đăng ký blockchain                  │
│  └─ [Patient chưa đăng ký chain]       │
│                                         │
└─────────────────────────────────────────┘
```

---

## 8. Phụ lục

### A. Loại xét nghiệm (recordType)

| Giá trị | Mô tả | Quyền yêu cầu |
|---------|-------|---------------|
| `GENERAL` | Xét nghiệm tổng quát | FULL (2) |
| `HIV_TEST` | Xét nghiệm HIV | SENSITIVE (3) |
| `DIABETES_TEST` | Xét nghiệm tiểu đường | FULL (2) |
| `LAB_RESULT` | Kết quả khác | FULL (2) |

### B. Cấp độ quyền truy cập

| Level | Giá trị | Ý nghĩa |
|-------|---------|---------|
| NONE | 0 | Không có quyền |
| EMERGENCY | 1 | Bác sĩ khẩn cấp (mặc định) |
| FULL | 2 | Quyền đầy đủ |
| SENSITIVE | 3 | Dữ liệu nhạy cảm (HIV) |

### C. Loại hash (verify)

| Type | Giá trị |
|------|---------|
| orderHash | 0 |
| labResultHash | 1 |
| interpretationHash | 2 |

### D. Trạng thái Lab Order (on-chain)

| Status | Giá trị | Ý nghĩa |
|--------|---------|---------|
| ORDERED | 0 | Vừa tạo, chờ bệnh nhân đồng ý |
| CONSENTED | 1 | Bệnh nhân đã đồng ý |
| IN_PROGRESS | 2 | Lab tech đang xử lý |
| RESULT_POSTED | 3 | Đã nhập kết quả |
| DOCTOR_REVIEWED | 4 | Bác sĩ đã diễn giải |
| COMPLETE | 5 | Hoàn tất |

### E. Trạng thái Medical Record (DB)

| Status | Ý nghĩa |
|--------|---------|
| CREATED | Hồ sơ vừa tạo |
| WAITING_RESULT | Đã tạo lab order, chờ kết quả |
| HAS_RESULT | Lab đã post kết quả |
| DIAGNOSED | Bác sĩ đã review & chẩn đoán |
| COMPLETE | Hồ sơ hoàn tất |

### F. Tóm tắt API theo Role

#### Patient APIs
```
POST   /v1/auth/register
POST   /v1/auth/login/nationId
POST   /v1/auth/login/wallet
POST   /v1/auth/refresh-token
DELETE /v1/auth/logout

POST   /v1/patients                    → Tạo profile
GET    /v1/patients/me                 → Xem profile

GET    /v1/patient-records             → Danh sách records
GET    /v1/patient-records/:recordId   → Chi tiết record
POST   /v1/patient-records/verify      → Verify hash

GET    /v1/lab-orders?status=...      → Danh sách lab orders
GET    /v1/lab-orders/:id              → Chi tiết lab order

POST   /v1/access-control/grant        → Cấp quyền prepare
POST   /v1/access-control/grant/confirm → Cấp quyền confirm
PATCH  /v1/access-control/update       → Cập nhật quyền prepare
PATCH  /v1/access-control/update/confirm → Cập nhật quyền confirm
POST   /v1/access-control/revoke       → Thu hồi quyền prepare
POST   /v1/access-control/revoke/confirm → Thu hồi quyền confirm
POST   /v1/access-control/check         → Kiểm tra quyền
POST   /v1/access-control/grant-info   → Xem thông tin quyền
GET    /v1/access-control/my-grants    → Danh sách đã cấp quyền

PATCH  /v1/lab-orders/:id/consent      → Consent prepare
PATCH  /v1/lab-orders/:id/consent/confirm → Consent confirm
```

#### Doctor APIs
```
POST   /v1/auth/login/nationId

GET    /v1/doctors/medical-records?status=...  → Worklist
GET    /v1/doctors/medical-records/:id         → Chi tiết hồ sơ
GET    /v1/doctors/patients?page=&limit=      → Danh sách BN
GET    /v1/doctors/patients/:patientId         → Chi tiết BN
GET    /v1/doctors/patients/:patientId/medical-records → Lịch sử BN

POST   /v1/doctors/patients/:patientId/medical-records → Tạo hồ sơ
POST   /v1/doctors/medical-records/:id/complete       → Direct complete

POST   /v1/lab-orders                    → Tạo lab order prepare
POST   /v1/lab-orders/confirm            → Tạo lab order confirm
POST   /v1/lab-orders/assign            → Phân công lab tech

PATCH  /v1/lab-orders/:id/interpretation       → Diễn giải prepare
PATCH  /v1/lab-orders/:id/interpretation/confirm → Diễn giải confirm
PATCH  /v1/lab-orders/:id/complete              → Chốt hồ sơ prepare
PATCH  /v1/lab-orders/:id/complete/confirm      → Chốt hồ sơ confirm

DELETE /v1/lab-orders/:id               → Xóa lab order
PATCH  /v1/lab-orders/:id/cancel        → Hủy lab order

GET    /v1/lab-orders?status=...        → Danh sách lab orders
GET    /v1/lab-orders/:id               → Chi tiết lab order
```

#### Lab Tech APIs
```
POST   /v1/auth/login/nationId

GET    /v1/lab-orders?status=CONSENTED|IN_PROGRESS|RESULT_POSTED
GET    /v1/lab-orders/:id

PATCH  /v1/lab-orders/:id/receive       → Tiếp nhận prepare
PATCH  /v1/lab-orders/:id/receive/confirm → Tiếp nhận confirm
PATCH  /v1/lab-orders/:id/post-result   → Nhập kết quả prepare
PATCH  /v1/lab-orders/:id/post-result/confirm → Nhập kết quả confirm
```

#### Admin APIs
```
POST   /v1/admins/auth/login

GET    /v1/admins/users?status=&page=&limit=  → Danh sách user
GET    /v1/admins/users/:id                    → Chi tiết user
POST   /v1/admins/users/:id/approve/prepare    → Duyệt user (prepare)
POST   /v1/admins/users/:id/approve/confirm    → Duyệt user (confirm)
PATCH  /v1/admins/users/:id/reject             → Từ chối user (off-chain)
PATCH  /v1/admins/users/:id/re-review          → Phục hồi xét duyệt (off-chain)
PATCH  /v1/admins/users/:id/verify-id          → Verify CMND
PATCH  /v1/admins/users/:id/soft-delete        → Xóa mềm (off-chain)

POST   /v1/admins/users/create-doctor          → Tạo bác sĩ prepare
POST   /v1/admins/users/create-doctor/confirm   → Tạo bác sĩ confirm
POST   /v1/admins/users/create-labtech          → Tạo lab tech prepare
POST   /v1/admins/users/create-labtech/confirm  → Tạo lab tech confirm

GET    /v1/blockchain/health
GET    /v1/blockchain/audit-logs?page=&limit=
GET    /v1/blockchain/audit-logs/entity/:entityType/:entityId
GET    /v1/blockchain/audit-logs/me
GET    /v1/blockchain/audit-logs/my-access-history
```

#### Common APIs (tất cả roles)
```
GET    /v1/users/me              → Profile user hiện tại
PATCH  /v1/users/me              → Cập nhật profile
PATCH  /v1/users/me/password    → Đổi mật khẩu
```

---

**Viết bởi:** Backend Team  
**Phiên bản:** 3.0 (Full API Reference)  
**Ngày cập nhật:** April 2026
