# 📘 Frontend Integration Guide — EHR Blockchain System

> **Mục đích:** Hướng dẫn team frontend tích hợp đầy đủ API, state machine, MetaMask flow và UI/UX cho 3 role: **Patient**, **Doctor**, **Lab Tech**.
>
> **Cập nhật:** April 2026 — sau bug-fix audit (wallet lookup, route wiring, status transitions).

---

## 📋 Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Auth & JWT](#2-auth--jwt)
3. [MetaMask Prepare/Confirm Pattern](#3-metamask-prepareconfirm-pattern)
4. [State Machine & Status](#4-state-machine--status)
5. [Flow theo Role](#5-flow-theo-role)
   - [5.1 Patient Flow](#51-patient-flow)
   - [5.2 Doctor Flow](#52-doctor-flow)
   - [5.3 Lab Tech Flow](#53-lab-tech-flow)
6. [API Reference theo Dashboard](#6-api-reference-theo-dashboard)
7. [Error Handling & Retry](#7-error-handling--retry)
8. [UI/UX Gợi ý](#8-uiux-gợi-ý)

---

## 1. Tổng quan kiến trúc

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

**Cookie:** `accessToken` (httpOnly, 20m), `refreshToken` (httpOnly, 14d)

---

## 2. Auth & JWT

### 2.1 Register (Patient)

```http
POST /v1/auth/register
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "SecurePass@123456",
  "nationId": "123456789012",
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
}
```

**Response:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "walletAddress": "0xED95...",
  "blockchainStatus": "PENDING"
}
```

> ⚠️ Patient cần được **Admin approve** trước khi ACTIVE.

### 2.2 Login (Local)

```http
POST /v1/auth/login/nationId
Content-Type: application/json

{
  "nationId": "123456789012",
  "password": "SecurePass@123456"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "status": "ACTIVE",
  "hasProfile": true
}
```

### 2.3 Login (Wallet / MetaMask)

**Step 1 — Get nonce:**
```http
POST /v1/auth/login/wallet
{ "walletAddress": "0x..." }
```
→ Response: `{ "nonce": "Login 1713000000000 - uuid..." }`

**Step 2 — Sign & send:**
```javascript
const signature = await ethereum.request({
  method: 'personal_sign',
  params: [nonce, walletAddress]
});
```

```http
POST /v1/auth/login/wallet
{ "walletAddress": "0x...", "signature": "0x..." }
```

### 2.4 Refresh Token

```http
POST /v1/auth/refresh-token
```
→ Cookie auto-sent. Returns new `accessToken`.

### 2.5 Logout

```http
DELETE /v1/auth/logout
```

---

## 3. MetaMask Prepare/Confirm Pattern

> **Nguyên tắc vàng:** Backend KHÔNG giữ private key. Mọi tx on-chain đều do **frontend ký** qua MetaMask.

### 3.1 Pattern 2 bước

```
┌─────────┐    prepare (no txHash)    ┌─────────┐
│ Frontend│ ─────────────────────────> │ Backend │
│         │ <───────────────────────── │         │
│         │    { txRequest, action }   │         │
│         │                          │         │
│         │  eth_sendTransaction       │         │
│         │ ────────> MetaMask ──────>│ Blockchain
│         │                          │         │
│         │  confirm (+ txHash)        │         │
│         │ ─────────────────────────> │         │
│         │ <───────────────────────── │         │
│         │    { success, status }     │         │
└─────────┘                          └─────────┘
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
  // 1. Prepare
  const prepareRes = await api.post(prepareUrl, prepareBody, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const txRequest = prepareRes.data?.txRequest;
  if (!txRequest) throw new Error("Prepare failed: no txRequest");

  // 2. Check chain
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId !== txRequest.chainId) {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: txRequest.chainId }]
    });
  }

  // 3. Sign & broadcast
  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [txRequest]
  });

  // 4. Confirm
  const confirmBody = buildConfirmBody(txHash);
  return api.post(confirmUrl, confirmBody, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

### 3.3 Lưu ý quan trọng

- **Không mutate payload** giữa prepare và confirm (ngoại trừ thêm `txHash`).
- **Khóa nút submit** trong lúc chờ MetaMask để tránh double submit.
- Nếu user reject MetaMask (`error code 4001`), giữ form để retry.
- Nếu tx pending lâu: cho phép user bấm "Tôi đã ký, thử confirm lại" với cùng `txHash`.

---

## 4. State Machine & Status

### 4.1 Lab Order Status (on-chain + DB)

```
ORDERED ──consent──> CONSENTED ──receive──> IN_PROGRESS ──post result──> RESULT_POSTED ──interpret──> DOCTOR_REVIEWED ──complete──> COMPLETE
   │                    │                      │                              │
   │                    │                      │                              │
   └─cancel/delete    └─cancel              └─cancel                     └─cancel (nếu chưa complete)
```

| Status | Ai thao tác | API Endpoint |
|--------|-------------|--------------|
| `ORDERED` | Doctor tạo | `POST /lab-orders` → confirm |
| `CONSENTED` | Patient đồng ý | `PATCH /lab-orders/:id/consent` → confirm |
| `IN_PROGRESS` | Lab tech tiếp nhận | `PATCH /lab-orders/:id/receive` → confirm |
| `RESULT_POSTED` | Lab tech nhập kết quả | `PATCH /lab-orders/:id/post-result` → confirm |
| `DOCTOR_REVIEWED` | Doctor diễn giải | `PATCH /lab-orders/:id/interpretation` → confirm |
| `COMPLETE` | Doctor chốt hồ sơ | `PATCH /lab-orders/:id/complete` → confirm |
| `CANCELLED` | Doctor hủy | `PATCH /lab-orders/:id/cancel` |

### 4.2 Medical Record Status (DB only — off-chain clinical flow)

```
CREATED ──create lab order──> WAITING_RESULT ──lab post result──> HAS_RESULT ──doctor interpret──> DIAGNOSED ──complete──> COMPLETE
   │                                                                                          │
   └─direct complete (không cần lab)                                                          └─direct complete
```

| Status | Ý nghĩa |
|--------|---------|
| `CREATED` | Bác sĩ vừa tạo hồ sơ khám |
| `WAITING_RESULT` | Đã tạo lab order, chờ kết quả |
| `HAS_RESULT` | Lab đã post kết quả |
| `DIAGNOSED` | Bác sĩ đã review & chẩn đoán |
| `COMPLETE` | Hồ sơ hoàn tất |

> ⚠️ **1 patient = 1 ACTIVE record** (CREATED/WAITING_RESULT/HAS_RESULT/DIAGNOSED). Phải complete trước khi tạo record mới.

---

## 5. Flow theo Role

### 5.1 Patient Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    👤 PATIENT APP                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Đăng ký / Đăng nhập                                     │
│     → POST /auth/register  hoặc  /auth/login/*              │
│                                                             │
│  2. Tạo hồ sơ bệnh nhân (nếu chưa có)                       │
│     → POST /patients  { fullName, gender, dob }             │
│                                                             │
│  3. Dashboard — "Sức khỏe của tôi"                          │
│     ├─ GET /patient-records          → Danh sách records    │
│     ├─ GET /lab-orders?status=...    → Danh sách lab orders │
│     └─ GET /access-control/my-grants → Ai đang có quyền    │
│                                                             │
│  4. Cấp quyền cho bác sĩ                                    │
│     → POST /access-control/grant → MetaMask ký → confirm     │
│                                                             │
│  5. Đồng ý xét nghiệm (Consent)                            │
│     → PATCH /lab-orders/:id/consent → MetaMask ký → confirm│
│                                                             │
│  6. Xem kết quả                                             │
│     → GET /patient-records/:recordId                        │
│     → GET /lab-orders/:id                                   │
│                                                             │
│  7. Verify hash (tùy chọn)                                  │
│     → POST /patient-records/verify                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### API chi tiết — Patient

| Mục đích | Method | Endpoint | Body chính |
|----------|--------|----------|------------|
| Tạo profile | POST | `/patients` | `{ gender, dob }` |
| Xem profile | GET | `/patients/me` | — |
| Xem records | GET | `/patient-records` | — |
| Xem record detail | GET | `/patient-records/:recordId` | — |
| Verify hash | POST | `/patient-records/verify` | `{ recordId, computedHash, hashType }` |
| Xem lab orders | GET | `/lab-orders` | `?status=ORDERED` |
| Xem lab order detail | GET | `/lab-orders/:id` | — |
| Cấp quyền prepare | POST | `/access-control/grant` | `{ accessorAddress, level, durationHours }` |
| Cấp quyền confirm | POST | `/access-control/grant/confirm` | `{ accessorAddress, txHash }` |
| Thu hồi quyền prepare | POST | `/access-control/revoke` | `{ accessorAddress }` |
| Thu hồi quyền confirm | POST | `/access-control/revoke/confirm` | `{ accessorAddress, txHash }` |
| Xem danh sách được cấp quyền | GET | `/access-control/my-grants` | `?page=1&limit=50` |
| Consent lab order prepare | PATCH | `/lab-orders/:id/consent` | — |
| Consent lab order confirm | PATCH | `/lab-orders/:id/consent/confirm` | `{ txHash }` |

---

### 5.2 Doctor Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   👨‍⚕️ DOCTOR DASHBOARD                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Đăng nhập (nationId + password)                         │
│     → POST /admins/auth/login  (nếu admin)                 │
│     → POST /auth/login/nationId (nếu doctor được tạo)      │
│                                                             │
│  2. Worklist — "Bệnh nhân cần xử lý"                        │
│     → GET /doctors/medical-records?status=HAS_RESULT        │
│     → GET /doctors/medical-records?status=WAITING_RESULT    │
│                                                             │
│  3. Chọn bệnh nhân → Xem lịch sử                           │
│     → GET /doctors/patients/:patientId/medical-records      │
│                                                             │
│  4. Khám & Tạo hồ sơ mới                                    │
│     → POST /doctors/patients/:patientId/medical-records     │
│       { chief_complaint, vital_signs, physical_exam, ... }   │
│                                                             │
│  5. Tạo lab order (nếu cần xét nghiệm)                     │
│     → POST /lab-orders → MetaMask ký → /lab-orders/confirm   │
│                                                             │
│  6. Chờ patient consent → lab tech process                 │
│                                                             │
│  7. Xem kết quả lab → Thêm diễn giải lâm sàng              │
│     → PATCH /lab-orders/:id/interpretation → MetaMask ký   │
│                                                             │
│  8. Chốt hồ sơ                                             │
│     → PATCH /lab-orders/:id/complete → MetaMask ký          │
│                                                             │
│  [Trường hợp không cần lab]                                │
│     → POST /doctors/medical-records/:id/complete            │
│       (direct complete, không cần MetaMask)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### API chi tiết — Doctor

| Mục đích | Method | Endpoint | Body chính |
|----------|--------|----------|------------|
| Xem worklist | GET | `/doctors/medical-records` | `?status=WAITING_RESULT,HAS_RESULT` |
| Xem record detail | GET | `/doctors/medical-records/:id` | — |
| Xem danh sách bệnh nhân | GET | `/doctors/patients` | `?page=1&limit=10` |
| Xem chi tiết bệnh nhân | GET | `/doctors/patients/:patientId` | — |
| Xem lịch sử bệnh nhân | GET | `/doctors/patients/:patientId/medical-records` | `?status=COMPLETE` |
| Tạo hồ sơ mới | POST | `/doctors/patients/:patientId/medical-records` | `{ chief_complaint, vital_signs, physical_exam, assessment, plan, diagnosis }` |
| Direct complete | POST | `/doctors/medical-records/:id/complete` | — |
| Tạo lab order prepare | POST | `/lab-orders` | `{ patientAddress, medicalRecordId, recordType, assignedLabTech, testsRequested, ... }` |
| Tạo lab order confirm | POST | `/lab-orders/confirm` | `{ ...prepareBody, txHash }` |
| Phân công lab tech | POST | `/lab-orders/assign` | `{ labOrderId, labTechId }` |
| Thêm diễn giải prepare | PATCH | `/lab-orders/:id/interpretation` | `{ interpretation, confirmedDiagnosis, recommendation, interpreterNote }` |
| Thêm diễn giải confirm | PATCH | `/lab-orders/:id/interpretation/confirm` | `{ ...prepareBody, txHash }` |
| Chốt hồ sơ prepare | PATCH | `/lab-orders/:id/complete` | — |
| Chốt hồ sơ confirm | PATCH | `/lab-orders/:id/complete/confirm` | `{ txHash }` |
| Xóa lab order | DELETE | `/lab-orders/:id` | — (chỉ khi status=ORDERED) |
| Hủy lab order | PATCH | `/lab-orders/:id/cancel` | `{ reason }` |

---

### 5.3 Lab Tech Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  🧪 LAB TECH DASHBOARD                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Đăng nhập                                               │
│     → POST /auth/login/nationId                             │
│                                                             │
│  2. Dashboard — "Cần làm ngay"                               │
│     → GET /lab-orders?status=CONSENTED                      │
│     → GET /lab-orders?status=IN_PROGRESS                    │
│     → GET /lab-orders?status=RESULT_POSTED                  │
│                                                             │
│  3. Tiếp nhận order                                         │
│     → PATCH /lab-orders/:id/receive → MetaMask ký → confirm │
│                                                             │
│  4. Làm xét nghiệm (offline)                                │
│                                                             │
│  5. Nhập kết quả                                            │
│     → PATCH /lab-orders/:id/post-result → MetaMask ký      │
│       Body: { rawData: { glucose, hba1c }, note }            │
│                                                             │
│  6. Done — chờ doctor review                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### API chi tiết — Lab Tech

| Mục đích | Method | Endpoint | Body chính |
|----------|--------|----------|------------|
| Xem danh sách orders | GET | `/lab-orders` | `?status=CONSENTED` hoặc `IN_PROGRESS` |
| Xem order detail | GET | `/lab-orders/:id` | — |
| Tiếp nhận prepare | PATCH | `/lab-orders/:id/receive` | — |
| Tiếp nhận confirm | PATCH | `/lab-orders/:id/receive/confirm` | `{ txHash }` |
| Post result prepare | PATCH | `/lab-orders/:id/post-result` | `{ rawData: { glucose, hba1c, ... }, note }` |
| Post result confirm | PATCH | `/lab-orders/:id/post-result/confirm` | `{ ...prepareBody, txHash }` |

---

## 6. API Reference theo Dashboard

### 6.1 Common APIs (tất cả roles)

```
GET    /v1/users/me              → Profile người dùng hiện tại
PATCH  /v1/users/me              → Cập nhật profile
PATCH  /v1/users/me/password    → Đổi mật khẩu
GET    /v1/lab-orders/:id       → Chi tiết lab order (role-based filter)
```

### 6.2 Query Parameters thường dùng

| Parameter | Giá trị | Ví dụ |
|-----------|---------|-------|
| `status` | comma-separated | `?status=WAITING_RESULT,HAS_RESULT` |
| `page` | number | `?page=1` |
| `limit` | number | `?limit=10` |

### 6.3 Response chuẩn

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [ ... ]
}
```

Hoặc cho prepare flow:

```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "CREATE_LAB_ORDER",
  "txRequest": {
    "to": "0x...",
    "data": "0x...",
    "value": "0",
    "chainId": "0xaa36a7",
    "from": "0x...",
    "gasLimit": 300000,
    "gasPrice": "20000000000",
    "nonce": 12
  },
  "details": { ... }
}
```

---

## 7. Error Handling & Retry

### 7.1 HTTP Status Codes

| Code | Ý nghĩa | UX hành động |
|------|---------|--------------|
| `200/201` | Thành công | Hiển thị kết quả |
| `400` | Payload sai / sai state transition | Hiển thị lỗi từ backend, giữ form |
| `401` | Token hết hạn | Tự động refresh token 1 lần, retry request |
| `403` | Sai role / tx signer không đúng | Chặn thao tác, hiển thị "Không có quyền" |
| `404` | Không tìm thấy entity / tx | Refresh danh sách, kiểm tra ID |
| `409` | Conflict / tx chưa confirm / race condition | Nút "Thử lại" hoặc reload trạng thái |

### 7.2 MetaMask Error Codes

| Code | Ý nghĩa | Hành động |
|------|---------|-----------|
| `4001` | User reject ký | Giữ form, cho phép retry |
| `-32603` | Internal error / nonce conflict | Gọi lại prepare để lấy tx mới |
| `4100` | Unauthorized (sai chain) | Switch chain rồi retry |

### 7.3 Interceptor Pattern (Axios/Fetch)

```typescript
// Axios interceptor cho 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        await api.post('/auth/refresh-token'); // cookie auto-sent
        return api(err.config); // retry original request
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

## 8. UI/UX Gợi ý

### 8.1 Patient Dashboard

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
│                                         │
└─────────────────────────────────────────┘
```

### 8.2 Doctor Dashboard

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

### 8.3 Lab Tech Dashboard

```
┌─────────────────────────────────────────┐
│         🧪 Kỹ thuật viên               │
├─────────────────────────────────────────┤
│                                         │
│  🔴 Cần tiếp nhận (CONSENTED)           │
│  └─ [BN Nguyễn Văn A] — Đường huyết    │
│                                         │
│  🟡 Đang xử lý (IN_PROGRESS)            │
│  ├─ [BN Trần Thị B] — HbA1c            │
│  └─ [BN Lê Văn C] — Công thức máu      │
│                                         │
│  🟢 Đã nhập kết quả (RESULT_POSTED)     │
│  └─ 12 orders                           │
│                                         │
└─────────────────────────────────────────┘
```

### 8.4 Button Enable Logic

| Role | Button | Enable khi |
|------|--------|------------|
| Patient | `[Đồng ý xét nghiệm]` | `labOrder.status === 'ORDERED'` |
| Patient | `[Thu hồi quyền]` | `grant.isActive === true` |
| Lab Tech | `[Tiếp nhận]` | `labOrder.status === 'CONSENTED' && assignedToMe` |
| Lab Tech | `[Nhập kết quả]` | `labOrder.status === 'IN_PROGRESS' && assignedToMe` |
| Doctor | `[Diễn giải]` | `labOrder.status === 'RESULT_POSTED'` |
| Doctor | `[Chốt hồ sơ]` | `labOrder.status === 'DOCTOR_REVIEWED'` |
| Doctor | `[Direct Complete]` | `medicalRecord.status === 'CREATED' && hasDiagnosis && noLabOrders` |

---

## 📎 Phụ lục

### A. Test Types (recordType)

| Value | Mô tả | requiredLevel |
|-------|-------|---------------|
| `GENERAL` | Xét nghiệm tổng quát | FULL (2) |
| `HIV_TEST` | Xét nghiệm HIV | SENSITIVE (3) |
| `DIABETES_TEST` | Xét nghiệm tiểu đường | FULL (2) |
| `LAB_RESULT` | Kết quả khác | FULL (2) |

### B. Access Levels

| Level | Value | Ý nghĩa |
|-------|-------|---------|
| NONE | 0 | Không cần quyền |
| EMERGENCY | 1 | Bác sĩ khẩn cấp (mặc định) |
| FULL | 2 | Quyền đầy đủ |
| SENSITIVE | 3 | Dữ liệu nhạy cảm (HIV) |

### C. Hash Types (verify)

| Type | Value |
|------|-------|
| orderHash | 0 |
| labResultHash | 1 |
| interpretationHash | 2 |

---

**Viết bởi:** Backend Team  
**Phiên bản:** 2.0 (post-audit)  
**Ngày cập nhật:** April 2026
