# MetaMask Prepare/Confirm Checklist (Lab Order + EHR Workflow)

## Preconditions

- User login đúng role theo endpoint (`DOCTOR` / `PATIENT` / `LAB_TECH`).
- Frontend có MetaMask và wallet đang active.
- Wallet đang dùng trên FE khớp `currentUser.walletAddress` ở backend.
- Đúng network/chainId theo backend trả về trong `txRequest.chainId`.

## Standard flow for every action

1. Call prepare API (`action` endpoint).
2. Verify response có `message`, `action`, `txRequest` (`to`, `data`, `value`, `chainId`).
3. FE gọi `eth_sendTransaction(txRequest)` qua MetaMask.
4. Nhận `txHash` từ MetaMask.
5. Call confirm API (`action/confirm`) với `txHash` (+ business payload nếu endpoint yêu cầu).
6. Verify DB state/audit log đã cập nhật đúng sau confirm.

---

## 1) Create Lab Order (DOCTOR)

- Prepare: `POST /v1/lab-orders`
- Confirm: `POST /v1/lab-orders/confirm`
- Confirm body bắt buộc gồm payload tạo order + `txHash`.

Expected:
- Prepare trả `action = CREATE_LAB_ORDER`.
- Confirm thành công tạo bản ghi lab order MongoDB, có `blockchainRecordId`, `orderHash`, `auditLogs`.

## 2) Consent Order (PATIENT)

- Prepare: `PATCH /v1/lab-orders/:id/consent`
- Confirm: `PATCH /v1/lab-orders/:id/consent/confirm`
- Confirm body: `{ "txHash": "0x..." }`

Expected:
- Prepare trả `action = CONSENT_LAB_ORDER`.
- Confirm đổi `sampleStatus` sang `CONSENTED`.

## 3) Assign Lab Tech (DOCTOR - creator only)

- Endpoint: `POST /v1/lab-orders/assign`
- Body: `{ "labOrderId": "...", "labTechId": "..." }`

Expected:
- Chỉ `DOCTOR` được gọi.
- Chỉ doctor tạo order (`createdBy`) mới assign được.
- Order phải đang `CONSENTED`.

## 4) Receive Order (LAB_TECH)

- Prepare: `PATCH /v1/lab-orders/:id/receive`
- Confirm: `PATCH /v1/lab-orders/:id/receive/confirm`

Expected:
- Prepare trả `action = RECEIVE_LAB_ORDER`.
- Confirm đổi `sampleStatus` sang `IN_PROGRESS`.

## 5) Post Lab Result (LAB_TECH)

- Prepare: `PATCH /v1/lab-orders/:id/post-result`
- Confirm: `PATCH /v1/lab-orders/:id/post-result/confirm`
- Confirm body: payload kết quả + `txHash`.

Expected:
- Prepare trả `action = POST_LAB_RESULT`.
- Confirm đổi `sampleStatus` sang `RESULT_POSTED`, lưu hash kết quả, tạo audit.

## 6) Clinical Interpretation (DOCTOR)

- Prepare: `PATCH /v1/lab-orders/:id/interpretation`
- Confirm: `PATCH /v1/lab-orders/:id/interpretation/confirm`
- Confirm body: payload diễn giải + `txHash`.

Expected:
- Prepare trả `action = ADD_CLINICAL_INTERPRETATION`.
- Confirm đổi `sampleStatus` sang `DOCTOR_REVIEWED`.

## 7) Complete Record (DOCTOR)

- Prepare: `PATCH /v1/lab-orders/:id/complete`
- Confirm: `PATCH /v1/lab-orders/:id/complete/confirm`

Expected:
- Prepare trả `action = COMPLETE_RECORD`.
- Confirm đổi `sampleStatus` sang `COMPLETE` và sync status medical record (best-effort).

---

## Negative checks (must fail)

- Confirm không có `txHash` -> `400`.
- `txHash` không thuộc wallet hiện tại -> `403`.
- `txHash` chưa mined hoặc failed -> `409` / `400`.
- Gọi action sai role -> `403`.
- Gọi action sai state machine (ví dụ receive khi chưa consent) -> `400`.
- Assign lab tech bởi doctor không phải creator -> `403`.

## FE implementation notes

- Prepare response chỉ là data để ký, chưa phải business commit.
- Business commit chỉ xảy ra sau confirm API thành công.
- FE nên disable nút confirm khi chưa có `txHash` hoặc tx chưa mined.
- Nên lưu `txHash` và retry confirm nếu request timeout phía client.
