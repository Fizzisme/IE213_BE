# Toi uu hieu nang Backend cho EHR + Blockchain

## 1) Van de va muc tieu

### Van de thuc te

- Sepolia mat khoang 12-15s de mine transaction.
- Nguoi dung quen UX duoi 1s.
- Neu cho blockchain confirm trong request dong bo, tong thoi gian co the 20-30s.

### Muc tieu cho do an

- API tao ho so phan hoi nhanh (duoi 300ms trong moi truong local/normal).
- Luong blockchain chay nen, khong block UI.
- Van dam bao tinh toan ven du lieu thong qua content hash.

---

## 2) Nguyen tac kien truc

- Source of truth ve toan ven: Blockchain (contentHash, tx, timestamp).
- Lop phuc vu query nhanh: MongoDB (medical_records, test_results, audit_logs).
- Backend la bo dieu phoi (orchestrator):
  - Ghi Mongo truoc.
  - Xac nhan on-chain sau (async).
  - Verify hash khi can.

---

## 3) State machine cho ban ghi y te

Nen tach ro trang thai nghiep vu va trang thai on-chain.

### Nhom trang thai on-chain de xac nhan tx

- `PENDING_USER_SIGNATURE`: da tao record Mongo, cho user ky MetaMask.
- `PENDING_CHAIN_CONFIRM`: da co txHash, cho mined.
- `CONFIRMED_ONCHAIN`: tx thanh cong, event hop le.
- `FAILED_ONCHAIN`: tx fail, timeout, hoac event khong khop.

### Nhom trang thai nghiep vu y te (existing)

- `CREATED`
- `HAS_RESULT`
- `DIAGNOSED`
- `COMPLETE`

Khuyen nghi: luu 2 nhom trang thai rieng de tranh xung dot logic.

---

## 4) Luong ghi de UX nhanh (Optimistic Write)

## Buoc 1: Tao record nhanh

- Backend nhan payload.
- Canonicalize JSON + tinh `contentHash`.
- Luu Mongo voi `onChainStatus = PENDING_USER_SIGNATURE`.
- Tra ve `mongoId`, `contentHash` ngay.

## Buoc 2: Frontend ky MetaMask

- Frontend goi contract `addRecord(...)`.
- Nhan `txHash`, `onChainRecordId` (neu co).

## Buoc 3: Confirm tx o backend

- Frontend goi endpoint confirm, gui `txHash`.
- Backend dua vao queue worker.
- Worker check receipt + event hop le.
- Update Mongo:
  - Thanh cong: `CONFIRMED_ONCHAIN`.
  - That bai: `FAILED_ONCHAIN` + `errorMessage`.

Luu y: Backend khong nen tin trang thai do frontend tu khai bao.

---

## 5) Luong doc de nhanh (Read Path)

- Danh sach ho so va tim kiem: doc MongoDB 100%.
- Blockchain chi dung cho:
  - Check access (can bo nho cache ngan han).
  - Verify integrity khi nguoi dung yeu cau.

### Mau flow

1. Check quyen (co the cache 30-60s).
2. Query Mongo theo `patientId`, `status`, `createdAt`.
3. Tra ket qua ngay.
4. Neu user bam Verify, moi goi chain so hash.

---

## 6) Canonical JSON va hash

Can tranh hash mismatch do thu tu key.

- Khong dung cach sort key top-level don gian.
- Dung canonicalization de quy cho object long nhau.
- Quy tac thong nhat:
  - Sort key theo alphabet.
  - Giu nguyen thu tu mang neu mang co y nghia nghiep vu.
  - Serialize o dinh dang on dinh truoc khi hash.

---

## 7) Queue worker cho blockchain

Nen co worker rieng cho viec confirm tx:

- Retry voi exponential backoff: 5s -> 10s -> 20s -> 40s...
- Dat gioi han retry (vi du 8-10 lan).
- Qua nguong thi mark `FAILED_ONCHAIN`.
- Log ro ly do fail: timeout, reverted, sai event, sai chain.

---

## 8) Cache de giam do tre

### Cache quyen truy cap

- Key: `access:{patient}:{accessor}`
- TTL: 30-60s
- Invalidate khi `grant/revoke/update` access.

### Cache danh sach record nong

- Key: `records:{patient}:{page}:{filter}`
- TTL ngan: 15-30s
- Invalidate khi tao/sua record.

---

## 9) Index MongoDB khuyen nghi

### medical_records

- `{ patientId: 1, createdAt: -1 }`
- `{ status: 1, createdAt: -1 }`
- `{ patientId: 1, status: 1, createdAt: -1 }`

### test_results

- `{ medicalRecordId: 1 }`
- `{ patientId: 1, createdAt: -1 }`

### audit_logs

- `{ userId: 1, createdAt: -1 }`
- `{ entityType: 1, entityId: 1 }`
- `{ txHash: 1 }`

### blockchain mapping (neu tach collection)

- `{ mongoId: 1 }` (unique)
- `{ txHash: 1 }` (unique)
- `{ status: 1, updatedAt: -1 }`

---

## 10) API contract goi y

### `POST /records`

- Input: `patientId`, `content`, `type`
- Output: `mongoId`, `contentHash`, `onChainStatus=PENDING_USER_SIGNATURE`

### `POST /records/:id/onchain-submit`

- Input: `txHash`, `chainId`, `onChainRecordId` (neu co)
- Backend queue confirm tx.

### `GET /records?patientId=...`

- Read tu Mongo.
- Tra kem badge trang thai on-chain.

### `POST /records/:id/verify`

- Backend tinh hash tu content Mongo.
- So voi hash tren chain.
- Output: `isIntact`, `onChainHash`, `computedHash`.

---

## 11) KPI theo doi

- p50/p95/p99 cho API create/read.
- Ty le tx confirm trong 60s.
- Ty le tx failed/retry.
- Ty le verify mismatch.
- So RPC call moi request (muc tieu giam dan).

---

## 12) Bang ke hoach trien khai (7 ngay)

| Giai doan | Hang muc | Cong viec chinh | Dau ra mong doi | Tieu chi hoan thanh |
|---|---|---|---|---|
| Ngay 1-2 | State machine + API co ban | Tach onChainStatus rieng; them endpoint create va onchain-submit | Record co 2 lop trang thai (nghiep vu + on-chain) | Tao record tra ve nhanh, co onChainStatus = PENDING_USER_SIGNATURE |
| Ngay 3 | Worker xac nhan tx | Tao queue worker, poll receipt, retry/backoff, mark success/fail | Co luong xac nhan on-chain bat dong bo | tx duoc cap nhat CONFIRMED_ONCHAIN hoac FAILED_ONCHAIN co ly do |
| Ngay 4 | Cache quyen truy cap | Cache hasAccess TTL ngan, invalidate khi grant/revoke/update | Giam so lan goi RPC | So RPC call/request giam ro va khong sai quyen |
| Ngay 5 | Canonical hash + verify API | Canonicalize JSON de quy, them endpoint verify | So hash on-chain on dinh, verify dung | Verify ra true voi du lieu goc, false khi du lieu bi sua |
| Ngay 6 | Observability | Them metrics p50/p95/p99, log slow query, log tx fail | Co dashboard/log de theo doi | Co du lieu KPI cho tung endpoint va tx worker |
| Ngay 7 | Test va chot demo | Smoke test E2E + load test nhe + chot script demo | Luong demo lien mach | Di qua duoc toan bo use case chinh khong loi nghiem trong |

---

## 13) Bang checklist nghiem thu demo

| ID | Hang muc nghiem thu | Cach test nhanh | Ket qua mong doi | Trang thai |
|---|---|---|---|---|
| C1 | Tao record phan hoi nhanh | Goi API create record | Thoi gian phan hoi < 1s UX | [ ] |
| C2 | Trang thai UI dung luong | Tao record roi theo doi badge | Badge PENDING -> CONFIRMED | [ ] |
| C3 | Verify toan ven thanh cong | Verify record nguyen ven | isIntact = true | [ ] |
| C4 | Phat hien gia mao | Sua content Mongo roi verify lai | isIntact = false | [ ] |
| C5 | Audit day du | Kiem tra log create/confirm/verify | Co log va timestamp day du | [ ] |

Tai lieu nay uu tien tinh thuc dung cho do an: de trien khai, de demo, de giai thich.
