# Frontend Handbook API + MetaMask Flow

Tài liệu này mô tả cách frontend tích hợp backend theo mô hình **MetaMask prepare/confirm** trong code runtime hiện tại.

## 1) Tổng quan kiến trúc FE tích hợp backend

### 1.1 Mô hình giao dịch chuẩn

Mọi nghiệp vụ on-chain đều theo 3 bước:

1. FE gọi API `prepare` (không có `txHash`) để lấy `txRequest`.
2. FE dùng MetaMask gửi giao dịch (`eth_sendTransaction`) với dữ liệu từ `txRequest`.
3. FE gọi API `confirm` (gửi lại payload nghiệp vụ + `txHash`) để backend verify on-chain và ghi DB/audit.

### 1.2 Nguyên tắc bất biến

- Backend **không ký tx thay user**.
- `tx.from` phải khớp wallet của user hiện tại (backend verify).
- Backend parse transaction input + event/receipt để xác nhận đúng hàm, đúng args, đúng trạng thái.

---

## 2) Chuẩn request/response dùng chung

## 2.1 Base URL và auth

- Base API V1: `/v1`
- Đa số API yêu cầu Bearer token: `Authorization: Bearer <accessToken>`
- Một số flow auth dùng cookie `accessToken` / `refreshToken` (HTTP-only).

## 2.2 Kiểu dữ liệu quan trọng

- `walletAddress`: địa chỉ EVM `0x...`
- `txHash`: transaction hash 32-byte hex
- `recordId`: ID on-chain (uint256)
- `labOrderId`, `medicalRecordId`: MongoDB ObjectId

## 2.3 Mẫu response prepare

```json
{
  "message": "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).",
  "action": "SOME_ACTION",
  "txRequest": {
    "to": "0x...",
    "data": "0x...",
    "value": "0",
    "chainId": "0xaa36a7"
  },
  "suggestedTx": {
    "from": "0x...",
    "gasLimit": 300000,
    "gasPrice": "20000000000",
    "nonce": 12
  },
  "details": {
    "functionSignature": "...",
    "chainId": 11155111
  }
}
```

## 2.4 Mẫu confirm

- Body thường gồm `txHash` + payload nghiệp vụ ban đầu.
- Nếu verify thành công: backend trả kết quả business + trạng thái mới.

## 2.5 Semantics status code thường gặp

- `200/201`: thành công
- `400`: payload sai, sai args, sai status transition
- `401`: token thiếu/hết hạn/không hợp lệ
- `403`: sai role, tx signer không đúng user
- `404`: không tìm thấy entity hoặc tx
- `409`: tx chưa confirm hoặc xung đột trạng thái (race)

---

## 3) Router map (runtime)

Từ `src/routes/v1/index.js`:

- `/v1/auth`
- `/v1/users`
- `/v1/admins/auth`
- `/v1/admins`
- `/v1/patients`
- `/v1/doctors`
- `/v1/lab-techs`
- `/v1/lab-orders`
- `/v1/access-control`
- `/v1/patient-records`
- `/v1/blockchain`

---

## 4) Auth flow cho FE

## 4.1 Local login

- `POST /v1/auth/login/nationId`
- Trả `accessToken`, `refreshToken`, `status`, `hasProfile`.
- Controller set cookie `accessToken` (20m), `refreshToken` (14d), đồng thời trả JSON token.

## 4.2 Wallet login (2-phase)

- `POST /v1/auth/login/wallet`
  - Phase 1: gửi `{ walletAddress }` -> nhận `{ nonce }`
  - Phase 2: gửi `{ walletAddress, signature }` -> nhận token

## 4.3 Refresh và logout

- `POST /v1/auth/refresh-token`: đọc refresh token từ cookie, cấp access token mới.
- `DELETE /v1/auth/logout`: clear cả 2 cookie.

## 4.4 FE khuyến nghị

- Ưu tiên dùng Bearer token cho API call app-side.
- Interceptor 401:
  1) gọi `/v1/auth/refresh-token`
  2) retry request cũ 1 lần
  3) nếu vẫn fail -> logout + về login.

---

## 5) Role-based feature map

- `ADMIN`
  - Quản trị user CRUD duyệt/từ chối/verify ID/soft-delete.
  - Prepare/confirm thêm doctor, lab tech, register patient on-chain.

- `PATIENT`
  - Consent lab order.
  - Grant/update/revoke access control (prepare/confirm).
  - Xem record và verify hash.

- `DOCTOR`
  - Tạo lab order (prepare/confirm).
  - Thêm clinical interpretation (prepare/confirm).
  - Complete record (prepare/confirm) hoặc direct complete medical record (off-chain).
  - Quản lý medical records bệnh nhân.

- `LAB_TECH`
  - Receive order (prepare/confirm).
  - Post lab result (prepare/confirm).

---

## 6) Playbook API chi tiết theo nhóm

## 6.1 Admin onboarding blockchain

### 6.1.1 Create Doctor

- Prepare: `POST /v1/admins/users/create-doctor`
- Confirm: `POST /v1/admins/users/create-doctor/confirm`

Body confirm (tối thiểu):

```json
{
  "email": "doctor@hospital.com",
  "password": "SecurePassword123",
  "nationId": "123456789",
  "walletAddress": "0x...",
  "txHash": "0x..."
}
```

### 6.1.2 Create Lab Tech

- Prepare: `POST /v1/admins/users/create-labtech`
- Confirm: `POST /v1/admins/users/create-labtech/confirm`

### 6.1.3 Register Patient on-chain

- Prepare: `POST /v1/admins/patients/:patientId/register-blockchain`
- Confirm: `POST /v1/admins/patients/:patientId/register-blockchain/confirm`

Lưu ý runtime: `registerPatient()` dùng `msg.sender`, nên tx phải do **wallet patient** ký.

## 6.2 Access Control (Patient)

- Prepare grant: `POST /v1/access-control/grant`
- Confirm grant: `POST /v1/access-control/grant/confirm`
- Prepare update: `PATCH /v1/access-control/update`
- Confirm update: `PATCH /v1/access-control/update/confirm`
- Prepare revoke: `POST /v1/access-control/revoke`
- Confirm revoke: `POST /v1/access-control/revoke/confirm`
- Check access: `POST /v1/access-control/check`
- Grant info: `POST /v1/access-control/grant-info`
- My grants: `GET /v1/access-control/my-grants`

Payload grant/update chính:

```json
{
  "accessorAddress": "0x...",
  "level": "FULL",
  "expiresAt": 1720000000
}
```

`expiresAt` được ưu tiên hơn `durationHours` trong service runtime.

## 6.3 Lab Order workflow (prepare/confirm)

### 6.3.1 Create lab order (Doctor)

- Prepare: `POST /v1/lab-orders`
- Confirm: `POST /v1/lab-orders/confirm`

Body bắt buộc runtime:

```json
{
  "patientAddress": "0x...",
  "medicalRecordId": "<objectId>",
  "recordType": "DIABETES_TEST",
  "assignedLabTech": "<userObjectId>",
  "testsRequested": [
    { "code": "GLUCOSE", "name": "Glucose" }
  ]
}
```

### 6.3.2 Consent (Patient)

- Prepare: `PATCH /v1/lab-orders/:id/consent`
- Confirm: `PATCH /v1/lab-orders/:id/consent/confirm`

### 6.3.3 Receive (Lab Tech)

- Prepare: `PATCH /v1/lab-orders/:id/receive`
- Confirm: `PATCH /v1/lab-orders/:id/receive/confirm`

### 6.3.4 Post Result (Lab Tech)

- Prepare: `PATCH /v1/lab-orders/:id/post-result`
- Confirm: `PATCH /v1/lab-orders/:id/post-result/confirm`

Body chính:

```json
{
  "rawData": { "glucose": 145, "hba1c": 7.2 },
  "note": "Kết quả tăng"
}
```

### 6.3.5 Interpretation (Doctor)

- Prepare: `PATCH /v1/lab-orders/:id/interpretation`
- Confirm: `PATCH /v1/lab-orders/:id/interpretation/confirm`

Body bắt buộc runtime:

```json
{
  "interpretation": "Diễn giải lâm sàng...",
  "confirmedDiagnosis": "Type 2 Diabetes",
  "recommendation": "...",
  "interpreterNote": "..."
}
```

### 6.3.6 Complete (Doctor)

- Prepare: `PATCH /v1/lab-orders/:id/complete`
- Confirm: `PATCH /v1/lab-orders/:id/complete/confirm`

## 6.4 Lab order non-MetaMask endpoints

- Detail: `GET /v1/lab-orders/:id`
- List: `GET /v1/lab-orders`
- Delete hard: `DELETE /v1/lab-orders/:labOrderId` (chỉ status phù hợp)
- Cancel soft: `PATCH /v1/lab-orders/:labOrderId/cancel`
- Assign lab tech: `POST /v1/lab-orders/assign`

## 6.5 Medical records / doctor APIs

- `GET /v1/doctors/medical-records/:medicalRecordId`
- `GET /v1/doctors/patients`
- `GET /v1/doctors/patients/:patientId`
- `GET /v1/doctors/patients/:patientId/medical-records`
- `POST /v1/doctors/patients/:patientId/medical-records`
- `POST /v1/doctors/medical-records/:medicalRecordId/complete` (direct complete, không ký tx)

## 6.6 Patient records

- `GET /v1/patient-records`
- `GET /v1/patient-records/:recordId`
- `POST /v1/patient-records/verify`

## 6.7 User profile

- `GET /v1/users/me`
- `PATCH /v1/users/me`
- `PATCH /v1/users/me/password`

## 6.8 Blockchain utility

- `GET /v1/blockchain/health`
- audit logs endpoints trong `/v1/blockchain/audit-logs*`

---

## 7) Frontend implementation guide (code-oriented)

## 7.1 Helper prepare + sign + confirm

```ts
async function runMetaMaskFlow<TPrepareBody extends object, TConfirmBody extends object>(
  prepareUrl: string,
  confirmUrl: string,
  prepareBody: TPrepareBody,
  buildConfirmBody: (txHash: string) => TConfirmBody,
  token: string
) {
  const prepareRes = await api.post(prepareUrl, prepareBody, bearer(token));
  const txRequest = prepareRes.data?.txRequest;
  if (!txRequest) throw new Error("Prepare không trả txRequest");

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [txRequest]
  });

  const confirmBody = buildConfirmBody(txHash);
  return api.post(confirmUrl, confirmBody, bearer(token));
}
```

## 7.2 Quy tắc quan trọng

- Không mutate payload giữa prepare và confirm (ngoại trừ thêm `txHash`).
- Khóa nút submit trong lúc chờ MetaMask/confirm để tránh double submit.
- Nếu user reject MetaMask (`4001`), giữ form để retry.
- Nếu tx pending lâu: cho phép user bấm “Tôi đã ký, thử confirm lại” bằng chính `txHash`.

## 7.3 Wallet + chain guard

Trước khi gửi tx:

- Check `window.ethereum` tồn tại.
- Check đúng chain (`chainId` từ `txRequest.chainId`).
- Nếu sai chain thì gọi `wallet_switchEthereumChain`.

---

## 8) Error handling matrix

- `400`:
  - Sai payload, thiếu field, sai state machine.
  - UX: hiển thị nội dung lỗi từ backend + giữ nguyên form.
- `401`:
  - Access token hết hạn.
  - UX: refresh token và retry 1 lần.
- `403`:
  - Sai role hoặc signer không đúng wallet user.
  - UX: chặn thao tác, hiển thị “Bạn không có quyền thao tác này”.
- `404`:
  - Không tìm thấy entity/tx.
  - UX: refresh danh sách, kiểm tra ID.
- `409`:
  - Tx chưa confirm hoặc trạng thái đã bị request khác thay đổi.
  - UX: nút “Thử confirm lại” hoặc reload trạng thái mới.

### Lỗi blockchain phổ biến FE cần xử lý

- User reject ký: EIP-1193 error code `4001`.
- Tx replaced/dropped: nên lưu `txHash` cuối cùng nhận được từ wallet/provider.
- Nonce conflict: cho phép user retry prepare để lấy tx mới.

---

## 9) State machine cho UI workflow

Chuỗi chính:

`ORDERED -> CONSENTED -> IN_PROGRESS -> RESULT_POSTED -> DOCTOR_REVIEWED -> COMPLETE`

Gợi ý enable button:

- Patient: chỉ thấy `Consent` khi `ORDERED` và là owner.
- Lab Tech: `Receive` khi `CONSENTED` + order được assign cho mình.
- Lab Tech: `Post result` khi `IN_PROGRESS`.
- Doctor: `Interpretation` khi `RESULT_POSTED`.
- Doctor: `Complete` khi `DOCTOR_REVIEWED`.

Khi `COMPLETE`: UI read-only.

---

## 10) Checklist test FE (manual/integration)

## 10.1 Happy path

1. Admin create doctor/labtech (prepare -> sign -> confirm)
2. Patient grant access (prepare -> sign -> confirm)
3. Doctor create lab order
4. Patient consent
5. Lab tech receive
6. Lab tech post result
7. Doctor add interpretation
8. Doctor complete

## 10.2 Permission path

- User role sai gọi endpoint -> phải nhận `403`.
- Doctor khác người tạo order thử assign -> `403`.
- Lab tech không được assign thử receive/post -> `403`.

## 10.3 Tx mismatch path

- Confirm với `txHash` từ wallet khác -> `403`.
- Confirm với tx gọi sai function -> `400`.
- Confirm khi tx chưa mined -> `409`.

## 10.4 Regression sau mỗi thay đổi API

- So khớp route/controller/service cho từng prepare/confirm pair.
- So khớp ABI function signature với `metaMaskTxBuilder`.
- So khớp `argsValidator` backend với payload FE gửi ở prepare.

---

## 11) Phụ lục payload mẫu

## 11.1 Confirm payload mẫu (grant access)

```json
{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "FULL",
  "expiresAt": 1720000000,
  "txHash": "0xabc123..."
}
```

## 11.2 Confirm payload mẫu (consent)

```json
{
  "txHash": "0xabc123..."
}
```

## 11.3 Confirm payload mẫu (create lab order)

```json
{
  "patientAddress": "0x...",
  "medicalRecordId": "6801a2b3c4d5e6f789012345",
  "recordType": "DIABETES_TEST",
  "assignedLabTech": "6851b2c3d4e5f6a789012365",
  "testsRequested": [{ "code": "GLUCOSE", "name": "Glucose" }],
  "txHash": "0xabc123..."
}
```

## 11.4 Suggested FE local state cho flow 2 bước

```ts
type PendingTxContext = {
  action: string;
  prepareUrl: string;
  confirmUrl: string;
  preparePayload: Record<string, unknown>;
  createdAt: number;
  txHash?: string;
};
```

Lưu tạm vào state manager hoặc session storage để recover khi user reload giữa prepare và confirm.

---

## 12) Ghi chú triển khai quan trọng

- Luôn coi blockchain là source of truth cho bước confirm.
- DB/audit có thể non-blocking ở một số nhánh (backend đã bọc try/catch), FE nên hiển thị warning mềm nếu cần.
- Dùng dữ liệu thực runtime trong service làm chuẩn khi Swagger khác biệt.
- Không thiết kế UI theo giả định backend có private key.
