# 🔍 Phân Tích Flow Logic Hệ Thống EHR - Clarification Report

**Ngày:** 2026-04-09  
**Tác giả:** Code Analysis  
**Trạng thái:** ✅ **CONFIRMED** - Flow có logic lâm sàn tốt, nhưng tài liệu hiện tại THIẾU bước đầu

---

## 📊 Executive Summary

Flow mà bạn mô tả **100% chính xác với codebase thực tế**. Hệ thống EHR thiết kế hai tầng:

- **OFF-CHAIN (MongoDB):** Medical record + diagnosis (mutable, nhanh)
- **ON-CHAIN (Blockchain):** Lab order + interpretation (immutable, an toàn)

**Kết luận:** Tài liệu API_TESTING_GUIDE hiện tại **THIẾU WORKFLOW STEP 1** (tạo medical record độc lập). Nên cập nhật để phản ánh flow hoàn chỉnh.

---

## 🔗 Quan hệ Entity (Entity Relationships)

### Medical Record ↔ Lab Order Relationship

```
Medical Record (OFF-CHAIN)          Lab Order (ON-CHAIN)
┌─────────────────────────┐         ┌─────────────────────────┐
│ _id: ObjectId           │◄───────┐│ _id: ObjectId           │
│ patientId: Ref          │        └│ relatedMedicalRecordId: │
│ diagnosis: String ✏️    │          │ (foreign key to MR)     │
│ diagnosisHistory: []    │          │                         │
│ interpreationHash: Str  │◄────────│ interpretationHash      │
│ confirmedDiagnosis: Str │◄────────│ clinicalInterpretation  │
│ status: CREATED...      │          │ status: ORDERED...      │
└─────────────────────────┘         └─────────────────────────┘
  (Cập nhật bởi DOCTOR              (Cập nhật bởi LAB TECH
   trong exam room)                  + DOCTOR từ blockchain)
```

**Quan hệ:**

- ✅ **1 Medical Record ↔ N Lab Orders** (1 patient, 1 active medical record, nhiều lab orders có thể link tới nó)
- ✅ **Lab Order TÙYCHỌN link** về Medical Record (relatedMedicalRecordId)
- ✅ **Auto-sync** khi doctor post interpretation (STEP 7.5)

**Foreign Key Schema:**

```javascript
// Medical Record Model (src/models/medicalRecord.model.js, line ~50)
diagnosis: String,                        // OFF-CHAIN, editable
confirmedDiagnosis: String,               // AUTO-SYNCED từ lab interpretation
interpretationHash: String,               // Link to blockchain hash

// Lab Order Model (src/models/labOrder.model.js, line ~20)
relatedMedicalRecordId: ObjectId,         // OPTIONAL link back
clinicalInterpretation: String,           // ON-CHAIN component (text stored in MongoDB)
interpretationHash: String,               // ON-CHAIN immutable hash
```

---

## 📋 Workflow Flow - Revised & Clarified

### **GIAI ĐOẠN 1: Khám Sáng Lập Hồ Sơ** (OFF-CHAIN)

**STEP 1: Bác sĩ TẠO MEDICAL RECORD độc lập**

```
Endpoint: POST /v1/doctors/patients/{patientId}/medical-records
Method: POST
Params: patientId (MongoDB ObjectId)

Request Body:
{
  "type": "DIABETES_TEST",      // GENERAL, HIV_TEST, DIABETES_TEST
  "note": "Patient có triệu chứng tiểu đường..."
}

Response: 201 Created
{
  "_id": "507f1f77bcf86cd799439999",
  "patientId": "507f1f77bcf86cd799439011",
  "createdBy": "507f1f77bcf86cd79943aaa1",  // Doctor ID
  "type": "DIABETES_TEST",
  "status": "CREATED",                       // Ready for diagnosis
  "diagnosis": null,
  "createdAt": "2026-04-09T10:00:00Z"
}
```

**Cơ chế Kiểu Thống:**

- ✅ Chỉ được tạo bởi DOCTOR (middleware enforced)
- ✅ 1 patient = 1 ACTIVE medical record tại một thời điểm
  - Statuses: CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE
  - Unique index: `{patientId: 1, _destroy: false, status: [CREATED...DIAGNOSED]}`
- ✅ Doctor có full quyền modify (vì là creator)

**Timeline:** 10:00 sáng - bác sĩ tạo hồ sơ từ dữ liệu ban đầu

---

### **GIAI ĐOẠN 2: Khám & Chẩn Đoán Sơ Bộ** (OFF-CHAIN)

**STEP 2A: Ghi lại vitals + exam findings (Implicit in medical record)**

```
(Doctor ghi lại trong note của Step 1)
- Mẫu: Physical exam: BP 140/90, Glucose quick test 250 mg/dL
- Triệu chứng: Khát nước, đi tiểu nhiều, mệt mỏi
```

**STEP 2B: Bác sĩ THÊM DIAGNOSIS sơ bộ (OFF-CHAIN, MUTABLE)**

```
Endpoint: PATCH /v1/doctors/medical-records/{medicalRecordId}/diagnosis
Method: PATCH
Params: medicalRecordId (MongoDB ObjectId)

Request Body:
{
  "diagnosis": "Suspected Type 2 Diabetes Mellitus - cần xét nghiệm FBG, HbA1c, lipid profile",
  "note": "Khám sâu sốt 39°C, khát nước cao, glucose quick test 250. Cần lab order."
}

Response: 200
{
  "message": "Chẩn đoán hồ sơ bệnh án thành công",
  "diagnosis": "Suspected Type 2 Diabetes Mellitus - cần xét nghiệm FBG, HbA1c, lipid profile",
  "status": "DIAGNOSED"
}
```

**Cơ chế Kiểu Thống:**

- ✅ OFF-CHAIN - MongoDB ONLY, không lên blockchain
- ✅ MUTABLE - doctor có thể sửa nhiều lần trước hoặc sau đó
- ✅ Stored as audit trail: `diagnosisHistory[{type: INITIAL, value: "...", source: EXAM}]`
- ✅ Mục đích: **Quyết định xét nghiệm nào cần làm**

**Timeline:** 10:05 - bác sĩ thêm diagnosis sơ bộ

---

### **GIAI ĐOẠN 3: Đặt Yêu Cầu Xét Nghiệm** (LAB ORDER)

**STEP 3: Bác sĩ TẠO LAB ORDER**

```
Endpoint: POST /v1/lab-orders
Method: POST

Request Body:
{
  "patientId": "507f1f77bcf86cd799439011",
  "patientAddress": "0xPATIENT111....",         // Patient wallet
  "patientName": "Nguyễn Văn A",
  "patientDOB": 1990,
  "recordType": "DIABETES_TEST",
  "testsRequested": [
    {"code": "GLUCOSE", "name": "Fasting Glucose", "urgent": false},
    {"code": "A1C", "name": "HbA1c", "urgent": false},
    {"code": "LIPID", "name": "Lipid Profile", "urgent": false}
  ],
  "priority": "normal",
  "clinicalNote": "Suspected T2DM - FBG 250, symptoms positive",
  "diagnosisCode": "E11.9",
  "relatedMedicalRecordId": "507f1f77bcf86cd799439999"   // 🆕 LINK
}

Response: 201 Created
{
  "_id": "507f1f77bcf86cd799439888",
  "patientId": "507f1f77bcf86cd799439011",
  "relatedMedicalRecordId": "507f1f77bcf86cd799439999",
  "status": "ORDERED",
  "orderHash": "0xabc123...",                    // Blockchain proof
  "blockchainTx": "0xtx_create_001"
}
```

**Cơ chế Kiểu Thống:**

- ✅ Tạo LAB ORDER (entity độc lập, NOT trong medical record)
- ✅ Tùy chọn: `relatedMedicalRecordId` (để auto-sync diagnosis sau)
- ✅ Status: ORDERED (pending patient consent)
- ✅ `orderHash` được tính toán và ghi lên blockchain (proof of order)
- ✅ Backend tính: `keccak256(metadata)` → `orderHash`

**Timeline:** 10:05 - bác sĩ tạo lab order (đã có diagnosis)

---

### **GIAI ĐOẠN 4: Kiểm Soát Quyền Riêng Tư (Patient Consent)**

**STEP 4: Bệnh nhân ĐỒNG ÝÀ cho lab tech xử lý mẫu**

```
Endpoint: POST /v1/patients/lab-orders/{recordId}/consent
Method: POST

Request Body:
{
  "approved": true,
  "note": "Bệnh nhân đồng ý xét nghiệm"
}

Response: 200
{
  "message": "Consent recorded",
  "recordId": "507f1f77bcf86cd799439888",
  "status": "CONSENTED",                          // Status changed
  "consentedAt": "2026-04-09T10:05:00Z",
  "consentTx": "0xtx_consent_001",
  "auditLog": {
    "patient": "0xPATIENT111...",
    "action": "CONSENTED",
    "timestamp": 1712683500
  }
}
```

**Cơ chế Kiểu Thống:**

- ✅ Middleware ENFORCES: Status phải là ORDERED trước
- ✅ Blockchain update: ORDERED → CONSENTED
- ✅ Bệnh nhân ÜY phải **wallet của họ** gọi endpoint (verified via JWT)
- ✅ Emit event: `PatientConsented(patientAddress, recordId)`
- ✅ **CRITICAL:** Lab tech BLOCKED từ posting kết quả nếu status != CONSENTED

**Timeline:** 10:05 - bệnh nhân Review & consent tại demo-kiosk hoặc mobile app

---

### **GIAI ĐOẠN 5-6: Lab Tech Lấy Mẫu & Đăng Kết Quả** (Lab Workflow)

**STEP 5: Lab Tech Nhận Lab Order**

```
Endpoint: GET /v1/lab-techs/pending-orders
Response: 200
[
  {
    "_id": "507f1f77bcf86cd799439888",
    "patientName": "Nguyễn Văn A",
    "testsRequested": ["GLUCOSE", "A1C", "LIPID"],
    "status": "CONSENTED",                    // Can NOW process
    "consentedAt": "2026-04-09T10:05:00Z"
  }
]
```

**STEP 6: Lab Tech POST Kết Quả (Multiple Batches)**

```
Endpoint: POST /v1/lab-techs/test-results
Method: POST

Request Body:
{
  "medicalRecordId": "507f1f77bcf86cd799439888",
  "testType": "GLUCOSE",
  "rawData": {
    "glucose": "285 mg/dL",
    "referenceRange": "70-100",
    "status": "HIGH",
    "timestamp": "2026-04-09T14:30:00Z"
  }
}

Response: 201
{
  "_id": "test_glucose_001",
  "medicalRecordId": "507f1f77bcf86cd799439888",
  "testType": "GLUCOSE",
  "labResultHash": "0xlab456...",            // Blockchain proof
  "onChain": true,
  "createdAt": "2026-04-09T14:30:00Z"
}
```

**Cơ chế Kiểu Thống:**

- ✅ Middleware ENFORCES: Status phải = CONSENTED, throw 403 nếu không
- ✅ FULL data lưu MongoDB (sensitive): glucose 285, reference ranges, tất cả
- ✅ Hash chỉ lưu blockchain (NOT sensitive data)
- ✅ Tính `labResultHash = keccak256(rawData)` → ghi blockchain
- ✅ Status: CONSENTED → IN_PROGRESS

**Timeline:** 14:30 - lab tech post GLUCOSE  
14:35 - lab tech post A1C  
14:40 - lab tech post LIPID  
**→ Status becomes RESULT_POSTED**

---

### **GIAI ĐOẠN 7: Doctor Kết Luận (ON-CHAIN, IMMUTABLE)**

**STEP 7: Bác sĩ ĐỌC KẾT QUẢ**

```
Endpoint: GET /v1/medical-records/{recordId}
(OR) GET /v1/lab-orders/{recordId}

Response: 200
{
  "_id": "507f1f77bcf86cd799439888",
  "status": "RESULT_POSTED",
  "testResults": [
    {
      "testType": "GLUCOSE",
      "value": "285 mg/dL",
      "referenceRange": "70-100",
      "status": "HIGH"
    },
    ...
  ],
  "orderHash": "0xabc123...",
  "labResultHash": "0xlab456..."
}
```

**STEP 7.5 (CRITICAL): Bác sĩ POST INTERPRETATION (ON-CHAIN, IMMUTABLE)**

```
Endpoint: PATCH /v1/lab-orders/{recordId}/interpretation
Method: PATCH

Request Body:
{
  "interpretation": "Glucose 285 mg/dL cao (ref 70-100), HbA1c 9.2% cao (ref <5.7%), lipid bất thường. Kết hợp triệu chứng lâm sàn và kết quả xét nghiệm, chẩn đoán: Type 2 Diabetes Mellitus xác nhận.",
  "recommendation": "1. Metformin 500mg x2/day. 2. Dietary counseling. 3. Exercise 30 min/day. 4. Follow-up HbA1c in 3 months.",
  "confirmedDiagnosis": "Type 2 Diabetes Mellitus"   // 🆕 EXPLICIT
}

Response: 200
{
  "message": "Thêm diễn giải lâm sàng thành công",
  "status": "DOCTOR_REVIEWED",
  "interpretationHash": "0xint789...",       // Blockchain proof
  "txHash": "0xtx_interp_001"
}
```

**After Blockchain Write - Auto-Sync (STEP 7.5):**

```javascript
// ehrWorkflow.service.js Line ~423
await medicalRecordService.syncConfirmedDiagnosisFromInterpretation(
  relatedMedicalRecordId, 
  {
    confirmedDiagnosis: "Type 2 Diabetes Mellitus",
    interpretationHash: "0xint789...",
    doctorId: currentUser._id
  }
);
```

**Result:**

```javascript
// Medical Record Auto-Updated
{
  "_id": "507f1f77bcf86cd799439999",
  "diagnosis": "Suspected Type 2 Diabetes...",   // Original (off-chain)
  "confirmedDiagnosis": "Type 2 Diabetes Mellitus",  // 🆕 From interpretation
  "interpretationHash": "0xint789...",            // Link to blockchain
  "diagnosisHistory": [
    {
      type: "INITIAL",
      value: "Suspected Type 2 Diabetes...",
      source: "EXAM",
      createdAt: "2026-04-09T10:05:00Z"
    },
    {
      type: "FINAL",
      value: "Type 2 Diabetes Mellitus",
      source: "LAB_INTERPRETATION",
      basedOnInterpretationHash: "0xint789...",
      createdAt: "2026-04-09T16:00:00Z"
    }
  ]
}
```

**Cơ chế Kiểu Thống:**

- ✅ ON-CHAIN - keccak256 hash posted to blockchain via `EHRManager.addClinicalInterpretation()`
- ✅ IMMUTABLE - không thể sửa sau khi posted
- ✅ `confirmedDiagnosis` là explicit field (doctor phải gửi)
- ✅ Auto-sync medical record với `confirmedDiagnosis + interpretationHash`
- ✅ Status: DOCTOR_REVIEWED
- ✅ Audit trail created: `diagnosisHistory` updated

**Timeline:** 16:00 - doctor post interpretation (IMMUTABLE from now)

---

### **GIAI ĐOẠN 8: Hoàn Thành & Verify** (Optional)

**STEP 8: Bác sĩ Hoàn Thành Hồ Sơ**

```
Endpoint: PATCH /v1/lab-orders/{recordId}/complete
Method: PATCH
(Similar flow - updates status to COMPLETE)
```

**STEP 9 (Verify Integrity):**

```
Endpoint: GET /v1/medical-records/{recordId}/verify
Response: 200
{
  "verification": {
    "orderHash": {
      "stored": "0xabc123...",
      "computed": "0xabc123...",
      "match": true ✅
    },
    "labResultHash": {
      "stored": "0xlab456...",
      "computed": "0xlab456...",
      "match": true ✅
    },
    "interpretationHash": {
      "stored": "0xint789...",
      "computed": "0xint789...",
      "match": true ✅
    },
    "dataIntegrity": "VERIFIED"  // No tampering detected
  }
}
```

---

## 🎯 Key Distinctions

### DIAGNOSIS vs INTERPRETATION

| Khía cạnh | DIAGNOSIS (Medical Record) | INTERPRETATION (Lab Order) |
|----------|---------------------------|---------------------------|
| **Nơi tính toán** | Physical exam + symptoms | Lab lab values + diagnosis |
| **Nơi lưu** | MongoDB (OFF-CHAIN) | MongoDB + Blockchain |
| **Endpoint** | `PATCH /doctors/medical-records/{id}/diagnosis` | `PATCH /lab-orders/{id}/interpretation` |
| **Timezone** | Before/after lab order | After lab results posted |
| **Tính Chất** | Editable (mutable) | Fixed (immutable on blockchain) |
| **Hash** | ❌ NO hash | ✅ `keccak256(interpretation + recommendation)` |
| **Blockchain** | ❌ NOT stored | ✅ Stored with interpretationHash |
| **Thay đổi được ko** | ✅ YES (many times) | ❌ NO (frozen forever) |
| **Mục đích** | Decide which tests to order | Authorize medical decision based on facts |
| **Legal Implication** | Clinical hypothesis (can be wrong) | Official verdict (must be preserved) |

**Tại sao khác:**

- Diagnosis = "I suspect this based on exam" (working note)
- Interpretation = "Lab proves this, here's what I recommend" (legal document)

---

## 🔐 Access Control & Patient Consent

### Access Grant Timing

```
FLOW DETAIL:

Doctor creates Medical Record
    ↓
Doctor adds diagnosis (can modify until complete)
    ↓
Doctor creates Lab Order
    ↓
[PATIENT MUST CONSENT HERE] ← Patient via /patients/lab-orders/{id}/consent
    ↓
Lab tech posts results (blocked if NO consent)
    ↓
Doctor post interpretation (ON-CHAIN)
    ↓
Auto-sync to Medical Record
```

### Questions Answered

**Q: Access grant nên chạy khi nào?**

- A: Automatic khi doctor tạo record (doctor là creator → automatic FULL access)
- Doctor khác cần access → patient grant via `POST /patients/access-grants`

**Q: Bác sĩ khác có thể đọc record không?**

- A: ❌ NO - unless patient grants via blockchain AccessControl
- Endpoint: `POST /v1/patients/access-grants` (WORKFLOW 2)
- Doctor must call `GET /v1/doctors/patients/{patientId}/records` with valid grant

**Q: Consent timing critical khi nào?**

- A: ✅ YES - Middleware checks BEFORE lab tech can post
  - If status != CONSENTED → throw 403
  - Protects patient privacy (no lab can process without approval)

---

## 📝 Multiple Medical Records

### Scenario: 1 Patient → Multiple Medical Records

```
Patient: Nguyễn Văn A (ID: 507f1f77bcf86cd799439011)

Recording 1:
- _id: rec_001
- Type: DIABETES_TEST
- Status: COMPLETE (finished)
- Diagnosis: Type 2 DM confirmed
- createdAt: 2026-03-01

Recording 2:
- _id: rec_002
- Type: HYPERTENSION_TEST
- Status: DIAGNOSED (active)
- Diagnosis: Hypertension stage 2
- createdAt: 2026-04-01

Recording 3:
- _id: rec_003
- Type: GENERAL_CHECKUP
- Status: CREATED (being examined)
- Diagnosis: null
- createdAt: 2026-04-09
```

### Constraint Rules

**Only 1 ACTIVE at a time:**

```
Active statuses: CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED
Inactive statuses: COMPLETE, REVOKED

Database Unique Index:
{ patientId: 1, _destroy: false }
Filter: status IN [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED]

Logic:
- When doctor calls POST/.../medical-records
- Check: COUNT where patientId=X AND status IN [ACTIVE]
- If count >= 1 → throw 400 "Patient has active record"
- Else → create new record
```

**GET /v1/doctors/medical-records response:**

```
Query params: ?status=CREATED,HAS_RESULT
Response:
[
  {
    _id: rec_002,
    status: HAS_RESULT,
    ...
  },
  {
    _id: rec_003,
    status: DIAGNOSED,
    ...
  }
]

Need pagination for large datasets.
```

---

## 🚨 Issues Identified in Current Documentation

### Issue #1: Missing STEP 1 (Medical Record Creation)

**Current API_TESTING_GUIDE.md:**

- Starts from "STEP 1: Doctor Creates Lab Order"
- SKIPS: Doctor creates medical record first

**Should be:**

- STEP 0: Doctor creates medical record
- STEP 1: Doctor adds diagnosis
- STEP 2: Doctor creates lab order
- STEP 3: Patient consents
- ... etc

### Issue #2: medicalRecordId vs recordId Confusion

**Current:** Uses inconsistently

- Sometimes: `medicalRecordId`
- Sometimes: `recordId` (which is actually lab order ID)

**Should:**

- `medicalRecordId` → Medical Record MongoDB ID
- `labOrderId` or `recordId` → Lab Order MongoDB ID

### Issue #3: Missing Relationship Context

**Current:** Doesn't explain:

- How medical record links to lab order
- Why interpretation auto-syncs diagnosis
- When to use relatedMedicalRecordId

**Should:** Add clear entity diagram

---

## ✅ Confirmed Logic - All Correct

| Aspect | Your Description | Codebase | Match |
|--------|------------------|----------|-------|
| Medical record creation | Doctor tạo độc lập (STEP 1) | ✅ Line 445, doctor.route.js | ✅ YES |
| Diagnosis off-chain | OFF-CHAIN, editable | ✅ medicalRecord.model, no blockchain | ✅ YES |
| Lab order required consent | Bệnh nhân phải đồng ý trước lab | ✅ ehrWorkflow consentToOrder() | ✅ YES |
| Lab tech blocked | Without consent → 403 | ✅ Middleware checkAccessGrant | ✅ YES |
| Lab results multiple batches | Multiple POST requests for each test | ✅ postLabResult() supports repeat | ✅ YES |
| Three-layer hash proof | orderHash → labResultHash → interpretationHash | ✅ All three calculated & stored | ✅ YES |
| Diagnosis mutable | Can change anytime off-chain | ✅ PATCH endpoint exists | ✅ YES |
| Interpretation immutable | Frozen on blockchain | ✅ addClinicalInterpretation() sends hash | ✅ YES |
| Auto-sync | Interpretation updates medical record | ✅ syncConfirmedDiagnosisFromInterpretation() | ✅ YES |

---

## 🎓 Recommendations

### 1. **Update API_TESTING_GUIDE_COMPLETE.md**

✅ Add STEP 0-1 (Medical Record Creation):

```markdown
### STEP 0: Doctor Creates Medical Record
Endpoint: POST /v1/doctors/patients/{patientId}/medical-records
...

### STEP 1: Doctor Adds Diagnosis (OFF-CHAIN)
Endpoint: PATCH /v1/doctors/medical-records/{medicalRecordId}/diagnosis
...

### STEP 2: Doctor Creates Lab Order
Endpoint: POST /v1/lab-orders
...
```

### 2. **Clarify Entity Relationships**

✅ Add diagram showing:

- Medical Record (OFF-CHAIN)
- Lab Order (ON-CHAIN) with foreignKey
- Auto-sync after interpretation

### 3. **Fix Terminology**

✅ Use consistently:

- `medicalRecordId` for medical record endpoints
- `labOrderId` for lab order endpoints
- Document: relatedMedicalRecordId field purpose

### 4. **Document Access Grant Flow**

✅ Clarify:

- When automatic (doctor creates record = automatic access)
- When required (doctor khác = patient must grant)
- Timing in overall workflow

### 5. **Document Multiple Records**

✅ Clarify constraint:

- Only 1 ACTIVE record at a time
- Multiple COMPLETE records allowed (historical)
- Need pagination for GET all records

---

## 📊 Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    COMPLETE EHR WORKFLOW                       │
└────────────────────────────────────────────────────────────────┘

EXAM ROOM (OFF-CHAIN)
├─ Step 1: Doctor creates Medical Record
│          POST /doctors/patients/{patientId}/medical-records
│          → MongoDB (Status: CREATED)
│
├─ Step 2: Doctor adds Diagnosis (OFF-CHAIN, MUTABLE)
│          PATCH /doctors/medical-records/{recordId}/diagnosis
│          → MongoDB only (No blockchain)
│
└─ Step 3: Doctor creates Lab Order
           POST /v1/lab-orders
           → MongoDB + Blockchain orderHash
           → Status: ORDERED

LAB WORKFLOW
├─ Step 4: Patient CONSENTS
│          POST /patients/lab-orders/{recordId}/consent
│          → Blockchain (Status: CONSENTED)
│
├─ Step 5: Lab tech gets pending orders
│          GET /lab-techs/pending-orders
│          → Filter by Status=CONSENTED
│
└─ Step 6: Lab tech posts results (Multiple batches)
           POST /lab-techs/test-results
           → MongoDB (full data) + Blockchain (hash)
           → Status: RESULT_POSTED

DOCTOR INTERPRETATION (ON-CHAIN)
└─ Step 7: Doctor posts interpretation (ON-CHAIN, IMMUTABLE)
           PATCH /lab-orders/{recordId}/interpretation
           → MongoDB (text) + Blockchain (hash)
           → Status: DOCTOR_REVIEWED
           
           [AUTO-SYNC happens here]
           ↓
           Medical Record updated with:
           - confirmedDiagnosis
           - interpretationHash
           - diagnosisHistory
```

---

## 📌 Conclusion

**Flow bạn mô tả ĐÚNG 100% với codebase thực tế.**

Vấn đề duy nhất: Tài liệu hiện tại (API_TESTING_GUIDE) **THIẾU bước tạo medical record ban đầu**. Cần cập nhật để phản ánh flow hoàn chỉnh và trường hợp thực tế ở phòng khám.

**Next Step:** Cập nhật tài liệu và thêm entity relationship clarification.
