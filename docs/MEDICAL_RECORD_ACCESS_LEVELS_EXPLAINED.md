# 🏥 Medical Record Access Control - Chi Tiết Quản Lý Quyền Truy Cập

## 🎯 Tình Huống

```
1 Bệnh nhân (Patient) Nguyễn Văn A
↓
├─ Medical Record #1: "Kiểm tra tiểu đường (2024)"
│  └─ Access Level 1: Doctor Minh (Full) → xem toàn bộ
│  └─ Access Level 2: Doctor Hòa (Partial) → chỉ xem kết quả

├─ Medical Record #2: "Xét nghiệm máu (2024)"
│  └─ Access Level: Lab Tech Lan (Restricted) → chỉ xem test results
│  └─ Access Level: Doctor Vân (Full) → xem toàn bộ

└─ Medical Record #3: "Tư vấn tâm lý (2024)"
   └─ Access Level: None → Chỉ bệnh nhân + bác sĩ tâm lý xem được
```

---

## 1️⃣ DATABASE ARCHITECTURE

### A. Medical Record Schema

```javascript
// src/models/medicalRecord.model.js

const medicalRecordSchema = new Schema({
  // === Record Info ===
  _id: ObjectId,
  patientId: ObjectId,           // Link to patient
  patientAddress: String,        // "0x709..." (blockchain)
  
  // === Content ===
  type: String,                  // "DIABETES_TEST", "BLOOD_WORK", "PSYCHOLOGY_CONSULT", etc
  diagnosis: String,             // Doctor's initial diagnosis
  clinicalNotes: String,         // Notes từ doctor
  
  // === Status ===
  status: String,                // "CREATED", "DIAGNOSED", "COMPLETED"
  
  // === Ownership & Creation ===
  createdBy: ObjectId,           // Doctor's ID (who created this record)
  createdByAddress: String,      // Doctor's wallet "0x862..."
  createdAt: Date,
  
  // === Access History ===
  accessLog: [{                  // Ai xem record này?
    accessedBy: String,          // "0x862..." (doctor/lab tech wallet)
    accessedAt: Date,
    action: String               // "VIEW", "EXPORT", "PRINT"
  }],
  
  // === Blockchain ===
  recordHash: String,            // Hash ghi lên blockchain
  blockchainTxHash: String,      // Tx hash khi tạo record
  
  createdAt: Date,
  updatedAt: Date
});
```

### B. Access Grant Schema

```javascript
// src/models/accessGrant.model.js

const accessGrantSchema = new Schema({
  _id: ObjectId,
  
  // === WHO & WHAT ===
  patientAddress: String,        // "0x709..." (bệnh nhân cấp quyền)
  granteeAddress: String,        // "0x862..." (ai nhận quyền - doctor/lab tech)
  granteeRole: String,           // "DOCTOR", "LAB_TECH", "SPECIALIST"
  
  // === WHICH RECORD ===
  recordId: ObjectId,            // Quyền truy cập record nào
  recordType: String,            // Ví dụ: "DIABETES_TEST"
  
  // === WHAT ACCESS ===
  accessLevel: String,           // "FULL", "READ_RESULTS", "READ_DIAGNOSIS", "READ_NOTES"
  
  // === WHEN & HOW LONG ===
  grantedAt: Date,
  expiryDate: Date,              // Khi nào hết hiệu lực
  
  // === BLOCKCHAIN PROOF ===
  messageHash: String,           // Hash của message patient đã sign
  blockchainTxHash: String,      // Proof on blockchain
  blockchainGrantId: Number,
  
  // === STATUS ===
  status: String,                // "ACTIVE", "REVOKED", "EXPIRED"
  revokedAt: Date,
  revokedReason: String,
  
  createdAt: Date
});
```

---

## 2️⃣ ACCESS LEVELS - ĐỊNH NGHĨA

### Loại Access Levels

```javascript
const ACCESS_LEVELS = {
  
  // === Mức 1: FULL ===
  FULL: {
    description: "Xem toàn bộ medical record",
    canView: ["diagnosis", "clinicalNotes", "testResults", "attachments", "history"],
    canExport: true,
    canPrint: true,
    canEdit: false,  // Chỉ creator có thể edit
    role: "DOCTOR"   // Thường Doctor chính trị liệu
  },
  
  // === Mức 2: READ_RESULTS ===
  READ_RESULTS: {
    description: "Chỉ xem kết quả xét nghiệm",
    canView: ["testResults"],  // Chỉ thấy: Glucose 145 mg/dL, HbA1c 7.2%
    canExport: true,
    canPrint: true,
    canEdit: false,
    role: "DOCTOR"   // Doctor khác, hoặc lab tech
  },
  
  // === Mức 3: READ_DIAGNOSIS ===
  READ_DIAGNOSIS: {
    description: "Xem chẩn đoán + kết quả (không xem notes)",
    canView: ["diagnosis", "testResults"],
    canExport: false,
    canPrint: false,
    canEdit: false,
    role: "SPECIALIST"  // Chuyên gia tư vấn
  },
  
  // === Mức 4: READ_NOTES ===
  READ_NOTES: {
    description: "Chỉ xem ghi chú y tế (không xem kết quả)",
    canView: ["clinicalNotes"],
    canExport: false,
    canPrint: false,
    canEdit: false,
    role: "LAB_TECH"  // Kỹ thuật viên lab
  },
  
  // === Mức 5: RESTRICTED ===
  RESTRICTED: {
    description: "Chỉ xem status (record tồn tại không?)",
    canView: ["status", "type"],
    canExport: false,
    canPrint: false,
    canEdit: false,
    role: "ADMIN"  // Quản trị viên hệ thống
  }
};
```

### Visual Permission Matrix

```
┌──────────────────────┬────────┬──────────────┬──────────────┬────────────┐
│ Thông Tin            │ FULL   │ READ_RESULTS │ READ_DIAGNOSIS│ READ_NOTES │
├──────────────────────┼────────┼──────────────┼──────────────┼────────────┤
│ Diagnosis (chẩn đoán)│   ✅   │      ❌      │      ✅      │     ❌     │
│ Clinical Notes       │   ✅   │      ❌      │      ❌      │     ✅     │
│ Test Results         │   ✅   │      ✅      │      ✅      │     ❌     │
│ Attachments (CT,MRI) │   ✅   │      ❌      │      ❌      │     ❌     │
│ Can Export           │   ✅   │      ✅      │      ❌      │     ❌     │
│ Can Print            │   ✅   │      ✅      │      ❌      │     ❌     │
└──────────────────────┴────────┴──────────────┴──────────────┴────────────┘
```

---

## 3️⃣ VÍ DỤ THỰC TẾ - PATIENT CÓ 3 RECORDS

### Scenario

Bệnh nhân Nguyễn Văn A (0x709...) có 3 medical records:

#### Record 1: Kiểm tra tiểu đường

```javascript
{
  _id: "rec_001",
  type: "DIABETES_TEST",
  createdBy: doctor_minh_id,    // Doctor Minh
  createdByAddress: "0x862...", // Doctor Minh wallet
  diagnosis: "Type 2 Diabetes",
  testResults: [
    { type: "GLUCOSE", result: "145 mg/dL" },
    { type: "HBA1C", result: "7.2%" }
  ]
}
```

**ACCESS GRANTS cho Record 1:**

```
Grant #1:
├─ recordId: "rec_001"
├─ granteeAddress: "0x862..." (Doctor Minh - người tạo record)
├─ accessLevel: "FULL"        ← Tạo ra nên xem toàn bộ
└─ status: "AUTO_GRANTED"     ← Tự động cấp khi tạo record

Grant #2:
├─ recordId: "rec_001"
├─ granteeAddress: "0x888..." (Doctor Hòa)
├─ accessLevel: "READ_RESULTS" ← Bệnh nhân cấp
└─ status: "ACTIVE"

Grant #3:
├─ recordId: "rec_001"
├─ granteeAddress: "0x999..." (Lab Tech Lan)
├─ accessLevel: "READ_RESULTS" ← Bệnh nhân cấp
└─ status: "ACTIVE"
```

---

#### Record 2: Xét nghiệm máu

```javascript
{
  _id: "rec_002",
  type: "BLOOD_WORK",
  createdBy: doctor_van_id,
  createdByAddress: "0x777...", // Doctor Vân wallet
  diagnosis: null,               // Chưa có chẩn đoán
  testResults: [...]
}
```

**ACCESS GRANTS cho Record 2:**

```
Grant #1:
├─ recordId: "rec_002"
├─ granteeAddress: "0x777..." (Doctor Vân - creator)
├─ accessLevel: "FULL"
└─ status: "AUTO_GRANTED"

Grant #2:
├─ recordId: "rec_002"
├─ granteeAddress: "0x862..." (Doctor Minh)
├─ accessLevel: "READ_RESULTS" ← Để xuất viện bệnh nhân gửi cho doctor chính
└─ status: "ACTIVE"
```

---

#### Record 3: Tư vấn tâm lý

```javascript
{
  _id: "rec_003",
  type: "PSYCHOLOGY_CONSULT",
  createdBy: doctor_psy_id,
  createdByAddress: "0x333...", // Doctor tâm lý wallet
  diagnosis: "Some psychological condition",
  clinicalNotes: "Private therapy notes..."
}
```

**ACCESS GRANTS cho Record 3:**

```
Grant #1:
├─ recordId: "rec_003"
├─ granteeAddress: "0x333..." (Doctor tâm lý - creator)
├─ accessLevel: "FULL"
└─ status: "AUTO_GRANTED"

// ❌ KO CÓ GRANT NÀO KHÁC
// Patient tự quyết định có share với doctor khác hay không
```

---

## 4️⃣ BACKEND LOGIC - AUTHORIZATION

### A. Khi Patient Log In → Thấy Records Nào?

```javascript
// src/controllers/medicalRecord.controller.js

async function getMyMedicalRecords(req, res) {
  // req.user từ JWT = { _id, walletAddress, role }
  const patientId = req.user._id;
  const patientAddress = req.user.walletAddress;
  
  // Tìm toàn bộ records của patient này
  const records = await MedicalRecord.find({
    patientId: patientId
  });
  
  res.json({
    statusCode: 200,
    message: "Lấy records của bệnh nhân",
    data: records  // Patient thấy TẤT CẢ records của mình
  });
}

// Patient LUÔN thấy toàn bộ medical records của mình
// (Đó là data của patient)
```

### B. Khi Doctor Log In → Thấy Records Nào?

```javascript
// src/controllers/medicalRecord.controller.js

async function getAccessibleRecords(req, res) {
  // req.user từ JWT = { _id, walletAddress, role: "DOCTOR" }
  const doctorAddress = req.user.walletAddress;
  
  // ⭐ Tìm những GRANTS được cấp cho doctor này
  const grants = await AccessGrant.find({
    granteeAddress: doctorAddress,
    status: "ACTIVE",
    expiryDate: { $gt: new Date() }
  });
  
  // grants = [
  //   { recordId: "rec_001", accessLevel: "FULL" },
  //   { recordId: "rec_001", accessLevel: "READ_RESULTS" },
  //   { recordId: "rec_002", accessLevel: "READ_RESULTS" }
  // ]
  
  // Map to get record IDs
  const recordIds = grants.map(g => g.recordId);
  
  // Fetch actual records
  const records = await MedicalRecord.find({
    _id: { $in: recordIds }
  });
  
  // ⭐ Trả về records + access level của mỗi record
  const result = records.map(record => {
    const grant = grants.find(g => g.recordId.toString() === record._id.toString());
    return {
      ...record.toObject(),
      accessLevel: grant.accessLevel
    };
  });
  
  res.json({
    statusCode: 200,
    data: result
    // Doctor chỉ thấy records có GRANT
  });
}
```

### C. Khi Doctor Xem Chi Tiết 1 Record → Lọc Dữ Liệu

```javascript
async function getMedicalRecordDetail(req, res) {
  const doctorAddress = req.user.walletAddress;
  const recordId = req.params.recordId;
  
  // ⭐ STEP 1: Check doctor có grant không
  const grant = await AccessGrant.findOne({
    recordId: recordId,
    granteeAddress: doctorAddress,
    status: "ACTIVE",
    expiryDate: { $gt: new Date() }
  });
  
  if (!grant) {
    return res.status(403).json({
      error: "Bạn không có quyền truy cập record này"
    });
  }
  
  // ⭐ STEP 2: Lấy record từ database
  const record = await MedicalRecord.findById(recordId);
  
  // ⭐ STEP 3: Lọc based on accessLevel
  const accessLevel = grant.accessLevel;
  const filtered = filterByAccessLevel(record, accessLevel);
  
  // ⭐ STEP 4: Log access
  await MedicalRecord.findByIdAndUpdate(recordId, {
    $push: {
      accessLog: {
        accessedBy: doctorAddress,
        accessedAt: new Date(),
        action: "VIEW"
      }
    }
  });
  
  res.json({
    statusCode: 200,
    data: filtered,
    accessLevel: accessLevel
  });
}

// ⭐ HELPER: Lọc fields based on access level
function filterByAccessLevel(record, accessLevel) {
  
  const filtered = {
    _id: record._id,
    type: record.type,
    createdAt: record.createdAt,
    status: record.status
  };
  
  switch(accessLevel) {
    
    case "FULL":
      // Xem toàn bộ
      return {
        ...filtered,
        diagnosis: record.diagnosis,
        clinicalNotes: record.clinicalNotes,
        testResults: record.testResults,
        attachments: record.attachments
      };
    
    case "READ_RESULTS":
      // Chỉ xem kết quả
      return {
        ...filtered,
        testResults: record.testResults
      };
    
    case "READ_DIAGNOSIS":
      // Xem chẩn đoán + kết quả
      return {
        ...filtered,
        diagnosis: record.diagnosis,
        testResults: record.testResults
      };
    
    case "READ_NOTES":
      // Chỉ xem notes
      return {
        ...filtered,
        clinicalNotes: record.clinicalNotes
      };
    
    case "RESTRICTED":
      // Chỉ thấy status + type
      return {
        ...filtered
      };
    
    default:
      return {};
  }
}
```

---

## 5️⃣ API ENDPOINTS IMPLEMENTATION

### A. Patient APIs

#### 1. Lấy tất cả records của bệnh nhân (chỉ patient xem được)

```
GET /v1/patients/me/medical-records
Authorization: Bearer {patientToken}

Response (200):
{
  "statusCode": 200,
  "data": [
    {
      "_id": "rec_001",
      "type": "DIABETES_TEST",
      "status": "COMPLETED",
      "createdBy": "Doctor Minh",
      "createdAt": "2026-04-01T10:00:00Z",
      "grants": [
        { "granteeAddress": "0x862...", "accessLevel": "FULL", "status": "AUTO" },
        { "granteeAddress": "0x888...", "accessLevel": "READ_RESULTS" },
        { "granteeAddress": "0x999...", "accessLevel": "READ_RESULTS" }
      ]
    },
    {
      "_id": "rec_002",
      "type": "BLOOD_WORK",
      "status": "COMPLETED",
      "createdBy": "Doctor Vân",
      "createdAt": "2026-04-02T10:00:00Z",
      "grants": [
        { "granteeAddress": "0x777...", "accessLevel": "FULL", "status": "AUTO" },
        { "granteeAddress": "0x862...", "accessLevel": "READ_RESULTS" }
      ]
    },
    {
      "_id": "rec_003",
      "type": "PSYCHOLOGY_CONSULT",
      "status": "COMPLETED",
      "createdBy": "Doctor tâm lý",
      "createdAt": "2026-04-03T10:00:00Z",
      "grants": [
        { "granteeAddress": "0x333...", "accessLevel": "FULL", "status": "AUTO" }
        // ❌ Không share với ai
      ]
    }
  ]
}
```

#### 2. Xem chi tiết 1 record (bệnh nhân xem toàn bộ)

```
GET /v1/patients/me/medical-records/:recordId
Authorization: Bearer {patientToken}

Response (200):
{
  "statusCode": 200,
  "data": {
    "_id": "rec_001",
    "type": "DIABETES_TEST",
    "diagnosis": "Type 2 Diabetes",
    "clinicalNotes": "...",
    "testResults": [...],
    "createdBy": "Doctor Minh",
    "createdAt": "2026-04-01T10:00:00Z"
  }
  // Patient thấy TẤT CẢ
}
```

#### 3. Grant quyền truy cập cho doctor (patient cấp quyền)

```
POST /v1/access-control/grant
Authorization: Bearer {patientToken}
Body:
{
  "recordId": "rec_001",
  "granteeAddress": "0x888...",  // Doctor Hòa wallet
  "accessLevel": "READ_RESULTS",
  "expiryDate": "2026-05-01",
  "signature": "0x1234...",       // EIP-191 signed
  "message": "Grant READ_RESULTS..."
}

Response (201):
{
  "statusCode": 201,
  "data": {
    "grantId": "grant_123",
    "status": "ACTIVE",
    "blockchainTxHash": "0xabc..."
  }
}
```

#### 4. Xem grants mình đã cấp (patient)

```
GET /v1/patients/me/grants-given
Authorization: Bearer {patientToken}

Response (200):
{
  "statusCode": 200,
  "data": [
    {
      "grantId": "grant_123",
      "recordId": "rec_001",
      "recordType": "DIABETES_TEST",
      "grantee": "Doctor Hòa",
      "granteeAddress": "0x888...",
      "accessLevel": "READ_RESULTS",
      "grantedAt": "2026-04-05",
      "expiryDate": "2026-05-01",
      "status": "ACTIVE"
    },
    // ... more grants
  ]
}
```

#### 5. Revoke quyền (bệnh nhân hủy grant)

```
PATCH /v1/access-control/revoke/:grantId
Authorization: Bearer {patientToken}

Body:
{
  "reason": "Bác sĩ này không còn cần thiết"
}

Response (200):
{
  "statusCode": 200,
  "message": "Quyền truy cập đã bị thu hồi",
  "data": {
    "grantId": "grant_123",
    "status": "REVOKED",
    "revokedAt": "2026-04-09T15:30:00Z"
  }
}
```

---

### B. Doctor APIs

#### 1. Xem records mình có quyền truy cập

```
GET /v1/doctors/me/accessible-records
Authorization: Bearer {doctorToken}

Response (200):
{
  "statusCode": 200,
  "data": [
    {
      "_id": "rec_001",
      "type": "DIABETES_TEST",
      "patient": "Nguyễn Văn A",
      "patientAddress": "0x709...",
      "accessLevel": "FULL",              ← Doctor Minh (creator)
      "createdAt": "2026-04-01T10:00:00Z"
    },
    {
      "_id": "rec_002",
      "type": "BLOOD_WORK",
      "patient": "Nguyễn Văn A",
      "patientAddress": "0x709...",
      "accessLevel": "READ_RESULTS",      ← Doctor Hòa (granted)
      "createdAt": "2026-04-02T10:00:00Z"
    }
  ]
  // Doctor chỉ thấy records có GRANT
}
```

#### 2. Xem chi tiết record (filtered by accessLevel)

```
GET /v1/doctors/me/accessible-records/:recordId
Authorization: Bearer {doctorToken}

Response (200) - Doctor Minh (FULL access):
{
  "statusCode": 200,
  "data": {
    "_id": "rec_001",
    "type": "DIABETES_TEST",
    "patient": "Nguyễn Văn A",
    "diagnosis": "Type 2 Diabetes",
    "clinicalNotes": "...",
    "testResults": [...],
    "attachments": [...],
    "accessLevel": "FULL"
  }
}

Response (200) - Doctor Hòa (READ_RESULTS):
{
  "statusCode": 200,
  "data": {
    "_id": "rec_001",
    "type": "DIABETES_TEST",
    "patient": "Nguyễn Văn A",
    "testResults": [...],
    "accessLevel": "READ_RESULTS"
    // ❌ diagnosis, clinicalNotes, attachments bị lọc
  }
}
```

#### 3. Xem grants được cấp cho mình (doctor)

```
GET /v1/doctors/me/grants-received
Authorization: Bearer {doctorToken}

Response (200):
{
  "statusCode": 200,
  "data": [
    {
      "grantId": "grant_123",
      "patientAddress": "0x709...",
      "patientName": "Nguyễn Văn A",
      "recordId": "rec_001",
      "recordType": "DIABETES_TEST",
      "accessLevel": "READ_RESULTS",
      "grantedAt": "2026-04-05",
      "expiryDate": "2026-05-01",
      "status": "ACTIVE"
    }
  ]
}
```

#### 4. Export data (based on access level)

```
GET /v1/doctors/me/accessible-records/:recordId/export
Authorization: Bearer {doctorToken}

Query params:
?format=pdf&signature=true

Response (200):
- PDF file containing only permitted fields
- Digital signature proof nếu export có yêu cầu
```

---

## 6️⃣ DATABASE QUERIES

### Query 1: Lấy records mà 1 doctor có quyền

```javascript
// Tìm grants cho doctor này
db.accessgrants.find({
  granteeAddress: "0x862...",
  status: "ACTIVE",
  expiryDate: { $gt: new Date() }
})

// Result:
// [
//   { recordId: ObjectId("rec_001"), accessLevel: "FULL" },
//   { recordId: ObjectId("rec_002"), accessLevel: "READ_RESULTS" }
// ]

// Rồi lấy records tương ứng
db.medicalrecords.find({
  _id: { 
    $in: [ObjectId("rec_001"), ObjectId("rec_002")]
  }
})
```

### Query 2: Kiểm tra doctor có quyền truy cập record không

```javascript
const hasAccess = await AccessGrant.findOne({
  recordId: ObjectId("rec_001"),
  granteeAddress: "0x888...",
  status: "ACTIVE",
  expiryDate: { $gt: new Date() }
});

// Result:
// { ...grant details } hoặc null
// 
// Nếu null → 403 Forbidden
// Nếu có → OK + return based on accessLevel
```

### Query 3: Lấy tất cả grants của 1 patient

```javascript
const grants = await AccessGrant.find({
  patientAddress: "0x709..."
}).populate('recordId');

// Result:
// [
//   {
//     recordId: { _id, type, createdBy, ... },
//     granteeAddress: "0x862...",
//     accessLevel: "FULL"
//   },
//   ...
// ]
```

---

## 7️⃣ FLOW DIAGRAM - COMPLETE

```
┌─────────────────────────────────────────────────────┐
│                    PATIENT                          │
├─────────────────────────────────────────────────────┤
│ Có 3 Medical Records:                               │
│  ✓ rec_001: DIABETES_TEST                          │
│  ✓ rec_002: BLOOD_WORK                             │
│  ✓ rec_003: PSYCHOLOGY_CONSULT                     │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────────┐
        │                    │              │
        ▼                    ▼              ▼
    ┌────────┐          ┌────────┐    ┌──────────┐
    │rec_001 │          │rec_002 │    │rec_003   │
    └────────┘          └────────┘    └──────────┘
        │ Grants given:   │ Grants given: │ Grants given:
        │                 │               │
        ├─ Doctor Minh    ├─ Doctor Minh  ├─ (NONE)
        │  (AUTO, FULL)   │  (AUTO, FULL) │
        │                 │               │
        ├─ Doctor Hòa     ├─ (No more)    │
        │  (READ_RESULTS) │               │
        │                 │               │
        └─ Lab Tech Lan   │
           (READ_RESULTS) │
                          │

┌─────────────────────────────────────────────────┐
│            DOCTOR MINH (0x862...)               │
├─────────────────────────────────────────────────┤
│ Can see FULL:                                   │
│  ✓ rec_001 full (creator)                      │
│  ✓ rec_002 full (creator, creator tự do)       │
│  ✗ rec_003 không (no grant)                    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│            DOCTOR HÒA (0x888...)                │
├─────────────────────────────────────────────────┤
│ Can see:                                        │
│  ✓ rec_001 READ_RESULTS only (xem test results)│
│  ✗ rec_002 không (no grant)                    │
│  ✗ rec_003 không (patient ko share)           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           LAB TECH LAN (0x999...)               │
├─────────────────────────────────────────────────┤
│ Can see:                                        │
│  ✓ rec_001 READ_RESULTS only (xem results)    │
│  ✗ rec_002 không (no grant)                    │
│  ✗ rec_003 không (no access)                  │
└─────────────────────────────────────────────────┘
```

---

## 8️⃣ COLLECTION CƠ SỐ DỮ LIỆU

```
┌─────────────────────────────┐
│    MEDICAL RECORDS          │
├─────────────────────────────┤
│ _id: ObjectId               │
│ patientId: ObjectId         │
│ patientAddress: String      │
│ type: String                │
│ diagnosis: String           │
│ clinicalNotes: String       │
│ testResults: Array          │
│ attachments: Array          │
│ createdBy: ObjectId         │
│ createdByAddress: String    │
│ accessLog: Array            │
│ blockchainHash: String      │
│ createdAt: Date             │
└─────────────────────────────┘
          ↓↑
  ┌─────────────────────────────┐
  │   ACCESS GRANTS             │
  ├─────────────────────────────┤
  │ _id: ObjectId               │
  │ patientAddress: String      │
  │ granteeAddress: String      │
  │ recordId: ObjectId   ←─────────┴──┐
  │ accessLevel: String              │
  │ grantedAt: Date                  │
  │ expiryDate: Date                 │
  │ status: String                   │
  │ blockchainTxHash: String         │
  │ createdAt: Date                  │
  └─────────────────────────────┘
```

---

## 📝 TÓM TẮT

| Câu Hỏi | Câu Trả Lời |
|---------|-----------|
| Mỗi Medical Record có bao nhiêu grants? | Tùy ý - tối thiểu 1 (creator), có thể 0 (private) |
| Patient có xem được toàn bộ records? | ✅ YES - Đó là data của họ |
| Doctor mới có xem được gì? | ❌ NOTHING - Đến khi patient grant |
| Ai tạo record được FULL tự động? | ✅ YES - Creator tự động có FULL (AUTO_GRANTED) |
| Làm sao biết doctor được xem gì? | Check accessLevel trong AccessGrant |
| Có thể grant cùng record cho nhiều doctor? | ✅ YES - Mỗi doctor một grant entry |
| Có thể grant khác nhau cho cùng doctor? | ❌ NO - 1 doctor = 1 grant per record |
| Grant hết hạn thì sao? | Kiểm tra expiryDate <= now() → tự động EXPIRED |
| Sửa record thì grants vẫn còn? | ✅ YES - Grants độc lập, mutation không qua grant |
