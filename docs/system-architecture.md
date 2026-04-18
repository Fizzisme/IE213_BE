# Kiến trúc hệ thống EHR Blockchain - Tài liệu tổng quan

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Phân chia On-chain / Off-chain](#3-phân-chia-on-chain--off-chain)
4. [Tương tác MetaMask của từng tài khoản](#4-tương tác-metamask-của-từng-tài-khoản)
5. [Luồng dữ liệu chi tiết](#5-luồng-dữ-liệu-chi-tiết)
6. [Tương tác giữa các thành phần](#6-tương-tác-giữa-các-thành-phần)
7. [Sơ đồ trạng thái record](#7-sơ-đồ-trạng-thái-record)

---

## 1. Tổng quan hệ thống

### Mô tả

Hệ thống quản lý kết quả xét nghiệm theo mô hình **patient-centric** trên blockchain Ethereum Sepolia. Dữ liệu nhạy cảm lưu off-chain (MongoDB/IPFS), blockchain chỉ lưu hash và trạng thái làm bằng chứng bất biến.

### Loại record được hỗ trợ

- `GENERAL` — xét nghiệm tổng quát
- `HIV_TEST` — xét nghiệm HIV (yêu cầu quyền SENSITIVE)
- `DIABETES_TEST` — xét nghiệm tiểu đường
- `LAB_RESULT` — kết quả xét nghiệm khác

---

## 2. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NGƯỜI DÙNG (Frontend)                              │
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ Bệnh nhân │  │ Bác sĩ   │  │ Lab Tech │  │  Admin   │                    │
│  │ (Patient) │  │ (Doctor) │  │          │  │          │                    │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘                    │
│        │             │             │             │                          │
│        │    MetaMask │    MetaMask │    nationId │                          │
│        │    (ký msg) │    (ký msg) │    (ký msg) │ + password               │
│        └─────────────┴─────────────┴─────────────┘                          │
│                              │                                               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
                               │ HTTP/REST API
                               │ (JWT token qua cookie)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Node.js/Express)                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Middleware Layer                               │    │
│  │  verifyToken → authorizeRoles → errorHandling                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Service Layer                                 │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │ auth.service│  │admin.service│  │labOrder.    │                 │    │
│  │  │             │  │             │  │service      │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │accessControl│  │ehrWorkflow. │  │patientRecord│                 │    │
│  │  │.service     │  │service      │  │.service     │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐                                   │    │
│  │  │blockchain   │  │patient.     │                                   │    │
│  │  │EventSync.   │  │service      │                                   │    │
│  │  │service      │  │             │                                   │    │
│  │  └─────────────┘  └─────────────┘                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Blockchain Layer (contract.js)                   │    │
│  │                                                                      │    │
│  │  ADMIN_PRIVATE_KEY dùng để ký tất cả giao dịch                      │    │
│  │  (backend ký thay mặt người dùng)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   BLOCKCHAIN     │ │      IPFS        │ │    MongoDB       │
│   (Sepolia)      │ │                  │ │                  │
│                  │ │  - Order meta    │ │  - Users         │
│  AccountManager  │ │  - Lab results   │ │  - Patients      │
│  AccessControl   │ │  - Interpretation│ │  - Lab Orders    │
│  EHRManager      │ │                  │ │  - Admins        │
│                  │ │                  │ │  - Audit Logs    │
│  Lưu: hash,      │ │                  │ │                  │
│  trạng thái,     │ │                  │ │  Lưu: metadata   │
│  sự kiện         │ │                  │ │  đầy đủ, cache   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 3. Phân chia On-chain / Off-chain

### On-chain (Blockchain Sepolia)

**Lưu trữ:**

- Hash của dữ liệu (keccak256)
- Trạng thái record (ORDERED, CONSENTED, IN_PROGRESS, v.v.)
- Quyền truy cập (ai được cấp quyền cho ai)
- Sự kiện (events) để audit trail

**Smart Contracts:**

| Contract | Chịu trách nhiệm |
|----------|-----------------|
| `AccountManager` | Quản lý role/status tài khoản (PATIENT, DOCTOR, LAB_TECH, ADMIN) |
| `AccessControl` | Quản lý quyền truy cập (grant, update, revoke) |
| `EHRManager` | Quản lý record xét nghiệm (addRecord, postLabResult, addClinicalInterpretation) |

**Dữ liệu on-chain:**

```
Record {
    id: 1,
    patient: 0x7099...79C8,
    author: 0x3C44...93BC,
    recordType: DIABETES_TEST,
    status: COMPLETE,
    orderHash: 0xabc123...,
    orderIpfsHash: "QmXo...",
    labResultHash: 0xdef456...,
    labResultIpfsHash: "QmYw...",
    interpretationHash: 0x789abc...,
    interpretationIpfsHash: "QmZo...",
    requiredLevel: FULL,
    createdAt: 1711500000,
    updatedAt: 1712104800
}
```

### Off-chain (MongoDB + IPFS)

**MongoDB lưu:**

- Thông tin người dùng đầy đủ (họ tên, email, SĐT)
- Metadata lab order (testsRequested, clinicalNote, sampleType)
- Kết quả xét nghiệm chi tiết (rawData: glucose, HbA1c...)
- Diễn giải lâm sàng (interpretation, recommendation)
- Audit logs

**IPFS lưu:**

- File metadata order (JSON)
- File kết quả xét nghiệm (JSON)
- File diễn giải lâm sàng (JSON)

---

## 4. Tương tác MetaMask của từng tài khoản

### Bệnh nhân (PATIENT)

**MetaMask dùng cho:**

1. **Đăng nhập**: Ký message (không tốn gas) → chứng minh sở hữu ví
2. **Xác nhận consent**: Backend ký thay (dùng ADMIN_PRIVATE_KEY)
3. **Cấp quyền**: Backend ký thay (dùng ADMIN_PRIVATE_KEY)

**Luồng:**

```
Bệnh nhân mở app
    ↓
Click "Connect MetaMask"
    ↓
Ký message (không tốn gas)
    ↓
Gửi signature lên backend
    ↓
Backend xác minh → cấp JWT token
    ↓
Bệnh nhân click "Đồng ý xét nghiệm"
    ↓
Backend gọi updateRecordStatus(CONSENTED)
    ↓
Backend ký bằng ADMIN_PRIVATE_KEY
    ↓
Giao dịch gửi lên blockchain
```

### Bác sĩ (DOCTOR)

**MetaMask dùng cho:**

1. **Đăng nhập**: Ký message (không tốn gas)
2. **Tạo lab order**: Backend ký thay
3. **Thêm diễn giải**: Backend ký thay
4. **Chốt hồ sơ**: Backend ký thay

**Luồng:**

```
Bác sĩ mở app
    ↓
Click "Connect MetaMask"
    ↓
Ký message (không tốn gas)
    ↓
Gửi signature lên backend
    ↓
Backend xác minh → cấp JWT token
    ↓
Bác sĩ click "Tạo lab order"
    ↓
Backend upload metadata lên IPFS
    ↓
Backend tính keccak256 hash
    ↓
Backend gọi addRecord()
    ↓
Backend ký bằng ADMIN_PRIVATE_KEY
    ↓
Giao dịch gửi lên blockchain
```

### Lab Tech

**MetaMask dùng cho:**

1. **Đăng nhập**: Ký message (không tốn gas)
2. **Tiếp nhận order**: Backend ký thay
3. **Post kết quả**: Backend ký thay

**Luồng:**

```
Lab Tech mở app
    ↓
Click "Connect MetaMask"
    ↓
Ký message (không tốn gas)
    ↓
Gửi signature lên backend
    ↓
Backend xác minh → cấp JWT token
    ↓
Lab Tech click "Tiếp nhận order"
    ↓
Backend gọi updateRecordStatus(IN_PROGRESS)
    ↓
Backend ký bằng ADMIN_PRIVATE_KEY
    ↓
Giao dịch gửi lên blockchain
```

### Admin

**KHÔNG dùng MetaMask** - đăng nhập bằng nationId + password

**Luồng:**

```
Admin mở app
    ↓
Nhập nationId + password
    ↓
Backend xác minh → cấp JWT token
    ↓
Admin click "Duyệt user"
    ↓
Backend gọi approveAccount()
    ↓
Backend ký bằng ADMIN_PRIVATE_KEY
    ↓
Giao dịch gửi lên blockchain
```

---

## 5. Luồng dữ liệu chi tiết

### Step 1: Đăng ký & Duyệt

```
Bệnh nhân                         Backend                         Blockchain
    |                                |                                |
    | 1. Đăng nhập MetaMask         |                                |
    |    (ký message)               |                                |
    |------------------------------->|                                |
    |                                | 2. registerPatient()           |
    |                                |------------------------------->|
    |                                |    (ADMIN_PRIVATE_KEY)         |
    | 3. Tạo hồ sơ bệnh nhân       |                                |
    |------------------------------->|                                |
    |                                |                                |
Admin                                |                                |
    | 4. Đăng nhập nationId+password|                                |
    |------------------------------->|                                |
    | 5. Click "Duyệt"              |                                |
    |------------------------------->|                                |
    |                                | 6. approveAccount()            |
    |                                |------------------------------->|
    |                                |    (ADMIN_PRIVATE_KEY)         |
```

### Step 2: Bệnh nhân cấp quyền

```
Bệnh nhân                         Backend                         Blockchain
    |                                |                                |
    | 1. Chọn bác sĩ, click        |                                |
    |    "Cấp quyền FULL 7 ngày"    |                                |
    |------------------------------->|                                |
    |                                | 2. grantAccess()               |
    |                                |------------------------------->|
    |                                |    (ADMIN_PRIVATE_KEY)         |
    |                                |                                |
    |                                | 3. Emit AccessGranted event    |
    |                                |<-------------------------------|
```

### Step 3: Bác sĩ tạo lab order

```
Bác sĩ                            Backend                         IPFS           Blockchain
    |                                |                                |                |
    | 1. Chọn bệnh nhân,            |                                |                |
    |    nhập thông tin xét nghiệm   |                                |                |
    |------------------------------->|                                |                |
    |                                | 2. Upload metadata             |                |
    |                                |------------------------------->|                |
    |                                | 3. Nhận IPFS hash              |                |
    |                                |<-------------------------------|                |
    |                                |                                |                |
    |                                | 4. addRecord()                 |                |
    |                                |----------------------------------------------->|
    |                                |    (ADMIN_PRIVATE_KEY)         |                |
    |                                |                                |                |
    |                                | 5. Emit RecordAdded event      |                |
    |                                |<-----------------------------------------------|
```

### Step 4-8: Workflow đầy đủ

```
Bệnh nhân        Backend         Lab Tech        Backend         Bác sĩ          Backend
    |               |               |               |               |               |
    | 1. Consent    |               |               |               |               |
    |-------------->|               |               |               |               |
    |               | 2. CONSENTED  |               |               |               |
    |               |-------------->|               |               |               |
    |               |               | 3. Receive    |               |               |
    |               |               |-------------->|               |               |
    |               |               |               | 4. IN_PROGRESS|               |
    |               |               |               |-------------->|               |
    |               |               | 5. Post result|               |               |
    |               |               |-------------->|               |               |
    |               |               |               | 6. RESULT_POSTED              |
    |               |               |               |-------------->|               |
    |               |               |               |               | 7. Interpret  |
    |               |               |               |               |-------------->|
    |               |               |               |               |               | 8. DOCTOR_REVIEWED
    |               |               |               |               |               |-------------->
    |               |               |               |               | 9. Complete   |
    |               |               |               |               |-------------->|
    |               |               |               |               |               | 10. COMPLETE
    |               |               |               |               |               |-------------->
```

### Step 9: Bệnh nhân xem hồ sơ

```
Bệnh nhân                         Backend                         Blockchain       IPFS
    |                                |                                |                |
    | 1. Mở "Hồ sơ xét nghiệm"     |                                |                |
    |------------------------------->|                                |                |
    |                                | 2. getPatientRecordIds()       |                |
    |                                |------------------------------->|                |
    |                                | 3. Danh sách recordId          |                |
    |                                |<-------------------------------|                |
    |                                |                                |                |
    |                                | 4. getRecord(recordId)         |                |
    |                                |------------------------------->|                |
    |                                | 5. Record metadata             |                |
    |                                |<-------------------------------|                |
    |                                |                                |                |
    |                                | 6. Fetch IPFS data             |                |
    |                                |------------------------------------------------>|
    |                                | 7. Dữ liệu JSON               |                |
    |                                |<------------------------------------------------|
    |                                |                                |                |
    |                                | 8. Verify hash                 |                |
    |                                |------------------------------->|                |
    |                                | 9. Hash khớp → dữ liệu toàn vẹn                |
    |                                |<-------------------------------|                |
    | 10. Hiển thị kết quả         |                                |                |
    |<-------------------------------|                                |                |
```

---

## 6. Tương tác giữa các thành phần

### Frontend → Backend

```
Frontend                    Backend
    |                          |
    | POST /v1/auth/wallet-login
    |------------------------->|
    |                          | 1. Tạo nonce
    | { nonce }                | 2. Lưu nonce vào Map
    |<-------------------------|
    |                          |
    | { walletAddress,         |
    |   signature }            |
    |------------------------->|
    |                          | 3. Verify signature
    |                          | 4. Tìm/tạo user
    | { accessToken,           | 5. Kiểm tra status
    |   refreshToken }         | 6. Tạo JWT token
    |<-------------------------|
```

### Backend → Blockchain

```
Backend                    Blockchain (Sepolia)
    |                          |
    | 1. Chuẩn bị giao dịch    |
    |    - function: approveAccount
    |    - params: [walletAddress]
    |    - signer: ADMIN_PRIVATE_KEY
    |                          |
    | 2. Ký giao dịch          |
    |    (ethers.js)           |
    |                          |
    | 3. Gửi giao dịch         |
    |------------------------->|
    |                          | 4. Xác nhận giao dịch
    |                          |    (trên Sepolia)
    | 5. Nhận receipt          |
    |<-------------------------|
    |                          |
    | 6. Parse event           |
    |    (StatusChanged)       |
    |                          |
    | 7. Cập nhật MongoDB      |
    |    (audit log)           |
```

### Backend → IPFS

```
Backend                    IPFS
    |                          |
    | 1. Chuẩn bị metadata     |
    |    { recordType,         |
    |      testsRequested,     |
    |      clinicalNote }      |
    |                          |
    | 2. Upload JSON           |
    |------------------------->|
    |                          |
    | 3. Nhận IPFS hash        |
    |<-------------------------|
    |    (QmXo...)             |
    |                          |
    | 4. Lưu vào MongoDB       |
    |    (orderIpfsHash)       |
```

---

## 7. Sơ đồ trạng thái record

```
                    ┌─────────────┐
                    │   ORDERED   │
                    │ (Bác sĩ tạo)│
                    └──────┬──────┘
                           │
                    Bệnh nhân consent
                           │
                           ▼
                    ┌─────────────┐
                    │  CONSENTED  │
                    │(BN đồng ý)  │
                    └──────┬──────┘
                           │
                    Lab Tech tiếp nhận
                           │
                           ▼
                    ┌─────────────┐
                    │ IN_PROGRESS │
                    │(Lab xử lý)  │
                    └──────┬──────┘
                           │
                    Lab Tech post kết quả
                           │
                           ▼
                    ┌─────────────┐
                    │RESULT_POSTED│
                    │(Có kết quả) │
                    └──────┬──────┘
                           │
                    Bác sĩ diễn giải
                           │
                           ▼
                    ┌─────────────┐
                    │DOCTOR_      │
                    │REVIEWED     │
                    │(Đã diễn giải)│
                    └──────┬──────┘
                           │
                    Bác sĩ chốt hồ sơ
                           │
                           ▼
                    ┌─────────────┐
                    │  COMPLETE   │
                    │(Hoàn tất)   │
                    └─────────────┘
```

**Lưu ý**: Không có đường đi ngược. Mỗi bước chỉ có thể thực hiện khi trạng thái đúng.
