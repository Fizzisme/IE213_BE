# 📸 Wallet Snapshot Denormalization - Giải Thích Chi Tiết

## 🎯 Tổng Quan

**Snapshot Denormalization** là kỹ thuật lưu trữ "ảnh chụp" (snapshot) địa chỉ ví (wallet) tại thời điểm tạo record, thay vì chỉ lưu ID người dùng và lấy wallet sau này.

**Vấn đề cơ bản:**

```
Cách cũ (Reference):
Medical Record → patientId → Find Patient → Find User → Get wallet
                 (reference)   Query 1      Query 2     Query 3
                                        = 3 queries mỗi lần gọi blockchain!

Cách mới (Denormalization):
Medical Record → patientWalletAddress (snapshot)
                 (giá trị trực tiếp)   = 0 query thêm!
```

---

## ❓ Tại Sao Snapshot?

### 1. **Audit Trail (Lịch Sử Không Thể Thay Đổi)**

```javascript
// Tình huống thực tế:
// - Ngày 1: Doctor tạo medical record cho Patient
//   Patient.wallet = "0xAAA..."
// - Ngày 30: Patient thay đổi wallet
//   Patient.wallet = "0xBBB..." (khác rồi!)

// Câu hỏi: Ai là người tạo record năm ngoái?
// - Nếu không có snapshot: Không biết (chỉ thấy wallet hiện tại 0xBBB)
// - Nếu có snapshot: Biết rõ là 0xAAA (lưu tại thời điểm tạo)

// Snapshot cho phép verify lịch sử = AUDIT TRAIL
```

### 2. **Blockchain Proof (Chứng Minh Trên Blockchain)**

```javascript
// Khi gọi blockchain:
const tx = await ehrManager.postLabResult(
    recordId,
    labResultHash,
    doctorWalletAddress  // ← Phải là wallet của doctor lúc tạo
);

// Blockchain sẽ validate:
// "Doctor này có quyền tạo kết quả cho record này không?"
// 
// Nếu doctor thay đổi wallet sau này, blockchain sẽ không nhận ra
// => Phải lưu snapshot tại lúc tạo để blockchain xác minh được
```

### 3. **Performance (Hiệu Năng)**

```javascript
// So sánh query pattern:

// REFERENCE (N+1 problem):
records.forEach(record => {
    const patient = await Patient.findById(record.patientId);        // Query 1
    const user = await User.findById(patient.userId);                // Query 2
    const wallet = user.authProviders.find(p => p.type === 'WALLET'); // Query 3
    // → 3 queries per record
    // → 100 records = 300 queries! 😱
});

// DENORMALIZATION (Direct access):
records.forEach(record => {
    const wallet = record.patientWalletAddress;  // ← Không cần query!
    // → 0 thêm queries
    // → 100 records = 0 queries! ✅
});
```

---

## 🔑 Snapshot ≠ Source of Truth

### **Khái Niệm Cốt Lõi**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  User.walletAddress = ADDRESS HIỆN TẠI                    │
│  (Dùng cho: Access Control, Permission Checking)          │
│  (Tính chất: Mutable - có thể thay đổi)                   │
│                                                             │
│  MedicalRecord.patientWalletAddress = SNAPSHOT             │
│  (Dùng cho: Blockchain Calls, Audit Trail, History)       │
│  (Tính chất: Immutable - không đổi sau khi tạo)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Ví Dụ Thực Tế Trong EHR**

```javascript
// Timeline:

// ✅ Ngày 1: Doctor tạo Medical Record
const doctor = {
    _id: "doc_123",
    walletAddress: "0xDDD...",  // Current wallet
};

const medicalRecord = {
    _id: "rec_456",
    patientId: "pat_789",
    doctorWalletAddress: "0xDDD...",  // SNAPSHOT at creation
    createdAt: "2026-04-01"
};

// ✅ Ngày 10: Doctor thay đổi wallet (vì bảo mật)
doctor.walletAddress = "0xEEE...";  // Updated!

// ✅ Ngày 15: Lab tech posts result on blockchain
// Blockchain call:
await ehrManager.postLabResult(
    "rec_456",
    labResultHash,
    medicalRecord.doctorWalletAddress  // ← Dùng SNAPSHOT 0xDDD
);

// ✅ Blockchain xác minh: "Đúng, doctor 0xDDD tạo record này" ✅

// ❌ Nếu dùng current wallet:
await ehrManager.postLabResult(
    "rec_456",
    labResultHash,
    doctor.walletAddress  // ← 0xEEE (WRONG! Record của doctor khác)
);
// ❌ Blockchain xác minh: "Doctor 0xEEE không tạo record này" ❌
```

---

## 📊 Khi Nào Dùng Snapshot vs Current?

### **Bảng So Sánh**

| Tình Huống | Dùng Snapshot | Dùng Current | Lý Do |
|-----------|---------------|-------------|-------|
| Gọi blockchain postLabResult | ✅ | ❌ | Blockchain cần verify lịch sử ai tạo |
| Ghi audit log | ✅ | ❌ | Audit log là lịch sử không thể thay đổi |
| Verify blockchain hash | ✅ | ❌ | Hash được tạo bởi snapshot wallet |
| Check quyền doctor hiện tại | ❌ | ✅ | Doctor có thể thay đổi wallet vẫn có quyền |
| Dashboard - "Ai tạo record?" | ✅ | ❌ | Lịch sử - ai tạo lúc đó |
| Dashboard - "Doctor này có access?" | ❌ | ✅ | Hiện tại - doctor này có quyền không |

### **Code Pattern**

```javascript
// ❌ SAI - Dùng snapshot cho access control
const hasAccess = await checkAccessControl(
    patientCurrentWallet,
    medicalRecord.doctorWalletAddress  // SNAPSHOT - SAI!
);

// ✅ ĐÚNG - Dùng current wallet cho access control
const hasAccess = await checkAccessControl(
    patientCurrentWallet,
    doctorUser.walletAddress  // CURRENT - ĐÚNG!
);

// ❌ SAI - Dùng current wallet cho blockchain
const tx = await ehrManager.postLabResult(
    recordId,
    labResultHash,
    doctorUser.walletAddress  // CURRENT (nếu doctor thay đổi wallet sẽ lỗi!)
);

// ✅ ĐÚNG - Dùng snapshot cho blockchain
const tx = await ehrManager.postLabResult(
    recordId,
    labResultHash,
    medicalRecord.doctorWalletAddress  // SNAPSHOT - ĐÚNG!
);
```

---

## 🏗️ Kiến Trúc Snapshot Trong EHR

### **MedicalRecord Model**

```javascript
const medicalRecordSchema = new mongoose.Schema({
    // ... fields khác ...
    
    // 🔹 SNAPSHOT FIELDS
    patientWalletAddress: {
        type: String,
        index: true,  // ← Indexed để query nhanh
        description: 'Wallet của patient TẠI THỜI ĐIỂM tạo record'
    },
    
    doctorWalletAddress: {
        type: String,
        index: true,
        description: 'Wallet của doctor TẠI THỜI ĐIỂM tạo record'
    },
    
    // 🔹 REFERENCE FIELDS (cũ)
    patientId: mongoose.Schema.Types.ObjectId,
    createdBy: mongoose.Schema.Types.ObjectId,
});
```

### **Xử Lý Tạo Record**

```javascript
// Step 1: Lấy current wallet (hiện tại)
const patientUser = await userModel.findById(patientId);
const currentPatientWallet = getUserWalletAddress(patientUser);

// Step 2: Lấy current wallet của doctor
const doctorUser = await userModel.findById(currentUser._id);
const currentDoctorWallet = getUserWalletAddress(doctorUser);

// Step 3: Lưu vào record như SNAPSHOT (tại lúc tạo)
const newRecord = {
    patientId,
    createdBy: currentUser._id,
    // 🔹 SNAPSHOT - lưu current wallet lúc này
    patientWalletAddress: currentPatientWallet,
    doctorWalletAddress: currentDoctorWallet,
    // ... other fields ...
};

// Từ đây trở đi:
// - patientWalletAddress & doctorWalletAddress KHÔNG THAY ĐỔI
// - Là ảnh chụp lúc tạo record
```

---

## 🔄 Flow Thực Tế - Lab Test Workflow

```
┌────────────────────────────────────────────────────────┐
│                    LAB TEST WORKFLOW                   │
└────────────────────────────────────────────────────────┘

STEP 1: Doctor tạo Medical Record (OFF-CHAIN)
├─ Fetch patient wallet = 0xPAT1
├─ Fetch doctor wallet = 0xDOC1
└─ Store SNAPSHOT:
   └─ patientWalletAddress: "0xPAT1"
   └─ doctorWalletAddress: "0xDOC1"
   
STEP 2: Doctor tạo Lab Order (OFF-CHAIN)
├─ Tạo request test
└─ Link tới medical record

STEP 3: Patient consent (ON-CHAIN)
└─ Blockchain verify: Đúng là 0xPAT1 consent lấy test

STEP 4: Lab Tech posts result (ON-CHAIN)
├─ Dùng SNAPSHOT: doctorWalletAddress = "0xDOC1"
├─ Gọi: ehrManager.postLabResult(recordId, hash, "0xDOC1")
└─ Blockchain verify: Đúng, doctor 0xDOC1 tạo record này ✅

STEP 5: Doctor interprets result (ON-CHAIN)
├─ Dùng SNAPSHOT: doctorWalletAddress = "0xDOC1"
├─ Gọi: ehrManager.addClinicalInterpretation(recordId, hash)
└─ Blockchain verify: Đúng, doctor 0xDOC1 có quyền ✅

STEP 6: Ghi audit log (OFF-CHAIN)
├─ Record: patientWalletAddress = "0xPAT1"
├─ Record: doctorWalletAddress = "0xDOC1"
└─ Audit log = Immutable proof of history
```

---

## 🚀 Performance Impact

### **Benchmark So Sánh**

```javascript
// Scenario: Dashboard hiển thị 50 medical records với blockchain info

// ❌ CÁCH CŨ (Reference)
Records fetched: 50
For each record:
  - Find patient: 50 queries
  - Find user: 50 queries
  - Extract wallet: 0 queries
  
Total: 100 queries
Time: ~5-10 seconds (tùy network)

// ✅ CÁCH MỚI (Snapshot)
Records fetched: 50
For each record:
  - Direct wallet access: 0 queries
  
Total: 0 thêm queries
Time: ~100ms (instant!)

// 🎯 Improvement: 50-100x faster!
```

### **Database Indexes**

Snapshot fields được indexing để tối ưu query:

```javascript
medicalRecordSchema.index({ patientWalletAddress: 1 });
medicalRecordSchema.index({ doctorWalletAddress: 1 });
medicalRecordSchema.index({ patientWalletAddress: 1, createdAt: -1 });
```

Cho phép queries như:

```javascript
// Find all records created by doctor
db.medical_records.find({ doctorWalletAddress: "0xDOC1" });

// Find all records with this patient
db.medical_records.find({ patientWalletAddress: "0xPAT1" });

// Audit trail: Find recent records for this wallet
db.medical_records.find({
    doctorWalletAddress: "0xDOC1",
    createdAt: { $gte: start, $lte: end }
});
```

---

## 🔐 Security Implications

### **Snapshot = Immutable Proof**

```javascript
// Ảnh chụp wallet lúc tạo record = Chứng minh lịch sử

// Scenario 1: Blockchain verification
Blockchain stores: txHash, recordId, interpretationHash
Database stores: recordId, doctorWalletAddress (snapshot)

When verifying history:
→ Blockchain says "Doctor 0xDOC1 created this interpretation"
→ Database confirms "Yes, doctor 0xDOC1 was associated with this record"
→ Immutable proof ✅

// Scenario 2: Impossible to manipulate history
Doctor A tạo record lúc wallet = 0xDOC1
Later, doctor thay đổi wallet = 0xDOC1_NEW

Cannot claim: "I never created that record"
Because record shows: doctorWalletAddress = 0xDOC1 (SNAPSHOT)
→ Audit trail không thể thay đổi ✅
```

### **Không Dùng Snapshot Cho Access Control**

```javascript
// ❌ SAI:
const canInterpret = await accessControl.checkAccess(
    patientId,
    medicalRecord.doctorWalletAddress  // SNAPSHOT
);

// Vấn đề:
// - Doctor thay đổi wallet → không có access (sai!)
// - Doctor có quyền nhưng khác wallet → không được dùng (sai!)

// ✅ ĐÚNG:
const canInterpret = await accessControl.checkAccess(
    patientId,
    doctorUser.walletAddress  // CURRENT
);

// Lợi ích:
// - Doctor vẫn có access dù thay đổi wallet
// - Permission check dùng current wallet
// - Snapshot chỉ dùng cho audit + blockchain
```

---

## 📝 Implementation Checklist

### **File: medicalRecord.model.js**

- ✅ `patientWalletAddress` field added (indexed)
- ✅ `doctorWalletAddress` field added (indexed)
- ✅ Vietnamese comments explaining snapshot

### **File: medicalRecord.service.js**

- ✅ `createNew()` captures wallet snapshots
- ✅ `getUserWalletAddress()` helper extracts from authProviders
- ✅ Audit log includes snapshot wallets
- ✅ Error handling for missing wallets

### **TODO: ehrWorkflow.service.js**

- ⏳ `postLabResult()` - Use snapshot for blockchain call
- ⏳ `addClinicalInterpretation()` - Use snapshot for blockchain call
- ⏳ Verify access control still uses current wallet

### **TODO: Other services**

- ⏳ Verify no access control checks use snapshot
- ⏳ Verify all blockchain calls use snapshot
- ⏳ Verify audit logs include snapshots

---

## 💡 Key Takeaways

| Khái Niệm | Ý Nghĩa |
|-----------|---------|
| **Snapshot** | Ảnh chụp wallet tại thời điểm tạo record |
| **Immutable** | Không thể thay đổi sau khi tạo (lịch sử) |
| **Current** | Wallet hiện tại của user (có thể thay đổi) |
| **Denormalization** | Lưu dữ liệu thay vì lấy qua query |
| **Access Control** | Dùng current wallet (mutable) |
| **Audit Trail** | Dùng snapshot (immutable) |
| **Blockchain Proof** | Dùng snapshot (phải match lúc tạo) |
| **Performance** | Snapshot = 0 queries, Reference = 3 queries |

---

## 🎓 Sự Tương Đồng Với Các Hệ Thống Khác

### **Epic EHR**

```
Document creation timestamp = audit trail
Document creator ID = snapshot (tại lúc tạo)
Current user access = based on current role
```

### **OpenMRS**

```
Encounter provider = snapshot tại lúc tạo
Current provider = có thể khác
Audit trail = không thể thay đổi
```

### **Azure Health Data Services**

```
FHIR Document metadata = snapshot
Resource author = immutable
Access control = based on current policy
```

EHR system of ours uses **the same pattern** ✅

---

## 📚 Tham Khảo Thêm

- [System Architecture](./system-architecture.md)
- [Blockchain Integration](./SMART-CONTRACT-INTEGRATION.md)
- [Access Control](./ACCESS_CONTROL_WORKFLOW_EXPLAINED.md)
- [Lab Order Workflow](./LAB_ORDER_WORKFLOW_ON_CHAIN_VS_OFF_CHAIN.md)

---

**Viết bởi:** Architecture Team  
**Lần cập nhật cuối:** April 16, 2026  
**Status:** ✅ Active - Used in current implementation
