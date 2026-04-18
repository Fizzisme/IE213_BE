# 🔐 Phân Tích Chi Tiết: Medical Record Permissions & Constraints

**Ngày:** 2026-04-09  
**Mục đích:** Giải thích rõ logic phân quyền medical record trong hệ thống EHR

---

## 📋 Câu Hỏi & Trả Lời

### **Câu 1: Bệnh nhân có quyền sửa medical record không?**

**❌ KHÔNG - Bệnh nhân KHÔNG CÓ QUYỀN sửa medical record**

**Bằng chứng từ code:**

```javascript
// src/routes/v1/doctor.route.js (Line 14)
Router.use(verifyToken, authorizeRoles('DOCTOR'));
```

**Giải thích:**

- Tất cả routes trong doctor.route.js **yêu cầu role = 'DOCTOR'**
- Bệnh nhân (role = 'PATIENT') không thể truy cập endpoint này
- Middleware `authorizeRoles('DOCTOR')` kiểm tra: nếu role ≠ DOCTOR → throw 403

**Routes cho Medical Record (tất cả là DOCTOR ONLY):**

```
POST   /v1/doctors/patients/{patientId}/medical-records      ← DOCTOR tạo
GET    /v1/doctors/medical-records                           ← DOCTOR xem danh sách
GET    /v1/doctors/medical-records/{medicalRecordId}         ← DOCTOR xem chi tiết
PATCH  /v1/doctors/medical-records/{medicalRecordId}/diagnosis ← DOCTOR sửa
```

**Không có endpoint nào cho patient:**

```
❌ POST   /v1/patients/medical-records                        ← Patient CANNOT create
❌ PATCH  /v1/patients/medical-records/{id}/diagnosis        ← Patient CANNOT edit
```

---

### **Câu 2: Mỗi lần khám, bác sĩ tạo 1 medical record khác hay sao?**

**✅ CÓ - Nhưng có constraint: 1 patient = 1 ACTIVE medical record**

**Constraint từ Database:**

```javascript
// src/models/medicalRecord.model.js (Lines 114-130)
medicalRecordSchema.index(
    { patientId: 1, _destroy: 1 },
    {
        name: 'unique_active_record_per_patient',
        unique: true,
        sparse: true,
        partialFilterExpression: {
            _destroy: false,
            status: { $in: ['CREATED', 'WAITING_RESULT', 'HAS_RESULT', 'DIAGNOSED'] }
        }
    }
);
```

**Giải thích:**

- **Unique Index:** Chỉ 1 record tại một lúc có thể là ACTIVE (status ∈ [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED])
- **_destroy: false:** Record chưa bị xóa mềm
- **Effect:** Database buộc chỉ 1 ACTIVE record per patient

**Service Logic Enforcement:**

```javascript
// src/services/medicalRecord.service.js (Lines 50-70)
const createNew = async (patientId, data, currentUser) => {
    // ✅ NEW LOGIC: Check ONLY ACTIVE records (not COMPLETE/REVOKED)
    const activeRecords = await medicalRecordModel.findOneByPatientId(patientId, [
        'CREATED',
        'WAITING_RESULT',
        'HAS_RESULT',
        'DIAGNOSED',  // FIX: Added missing status
    ]);

    if (activeRecords.length > 0) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Bệnh nhân đang có 1 hồ sơ chưa hoàn thành (${activeRecords[0].status}). ` +
            `Vui lòng hoàn thành hồ sơ trước khi tạo mới! ` +
            `(ID: ${activeRecords[0]._id})`
        );
    }

    // Tạo record mới
    const newRecord = {
        patientId,
        createdBy: currentUser._id,  // Doctor ID
        type: data.type,
        note: data.note,
        createdAt: new Date(),
    };

    const medicalRecord = await medicalRecordModel.createNew(newRecord);
    return medicalRecord;
};
```

**Workflow Thực Tế:**

```
Lần khám 1 (ngày 1):
├─ Doctor tạo Medical Record 1
│  └─ Status: CREATED → ... → COMPLETE
│     (sau khi hoàn thành toàn bộ flow)
│
Lần khám 2 (ngày 3):
├─ Doctor muốn tạo Medical Record 2
├─ System check: "Có ACTIVE record không?"
│  └─ Nếu Record 1 = COMPLETE (inactive) → ✅ Cho phép tạo Record 2
│  └─ Nếu Record 1 = WAITING_RESULT (active) → ❌ Từ chối, phải hoàn thành Record 1 trước

Kết quả:
├─ Record 1: Status = COMPLETE (lịch sử)
└─ Record 2: Status = CREATED (active hiện tại)
```

---

### **Câu 3: Bệnh nhân không cần quyền để thêm record, nhưng xem cần?**

**❌ BỆNH NHÂN KHÔNG THỂ THÊM - Chỉ DOCTOR tạo**

**❓ BỆNH NHÂN CÓ THỂ XEM KHÔNG? - Dữ liệu chưa đầy đủ**

**Hiện tại:**

- Không có endpoint cho patient xem medical record
- Routes chỉ cho doctor: `/v1/doctors/medical-records`
- Không có: `/v1/patients/medical-records`

**Inference (dựa trên access control logic):**

Nếu tương lai có endpoint cho patient xem, logic sẽ là:

```javascript
// Dự đoán endpoint (chưa tồn tại):
// GET /v1/patients/medical-records/{recordId}

// Logic access control sẽ check:
// - Patient có quyền xem record của chính họ không?
// - Doctor có grant access cho patient?  ← Ngược lại với doctor xem record
```

**Nhưng hiện tại: Patient không thể xem medical record qua API**

---

### **Câu 4: Mỗi bệnh nhân có nhiều medical records không?**

**✅ CÓ - Nhưng chỉ 1 ACTIVE tại 1 lúc**

**Ví dụ Thực Tế:**

```
Patient: Nguyễn Văn A (ID: 507f1f77bcf86cd799439011)

Medical Record 1:
├─ _id: rec_001
├─ Type: DIABETES_TEST
├─ Status: COMPLETE (inactive)
├─ Diagnosis: Type 2 Diabetes confirmed earlier
└─ createdAt: 2026-03-01

Medical Record 2:
├─ _id: rec_002
├─ Type: HYPERTENSION_CHECK
├─ Status: HAS_RESULT (active - đang xử lý)
├─ Diagnosis: Hypertension stage 2 - needs lab
└─ createdAt: 2026-04-05

Medical Record 3:
├─ _id: rec_003
├─ Type: GENERAL_CHECKUP
├─ Status: CREATED (active - hiện tại) ← NHưng chỉ 1 ACTIVE!
├─ Diagnosis: null
└─ createdAt: 2026-04-09
```

❌ **Lỗi:** Không thể có 2 ACTIVE records cùng lúc

✅ **Đúng:** Chỉ Record 3 là ACTIVE, 1 và 2 phải COMPLETE trước

---

## 🔑 Key Logic Points

### **1. WHO CREATES?**

| Entity | By Whom | Endpoint | Method |
|--------|---------|----------|--------|
| Medical Record | ✅ DOCTOR only | `POST /v1/doctors/patients/{patientId}/medical-records` | POST |
| Diagnosis (update) | ✅ DOCTOR only | `PATCH /v1/doctors/medical-records/{id}/diagnosis` | PATCH |
| Lab Order | ✅ DOCTOR only | `POST /v1/lab-orders` | POST |
| Patient Consent | ✅ PATIENT | `POST /v1/patients/lab-orders/{id}/consent` | POST |
| Interpretation | ✅ DOCTOR only | `PATCH /v1/lab-orders/{id}/interpretation` | PATCH |

**Pattern:** Medical Record & Diagnosis = DOCTOR ONLY (no patient creation)

### **2. ACCESS CONTROL MIDDLEWARE**

**For Viewing Medical Records:**

```javascript
// src/middlewares/checkAccessGrant.js
const checkAccessGrant = async (req, res, next) => {
    // When doctor tries to view a specific record:
    // 1. Extract patientId from record
    // 2. Check blockchain: does doctor have grant from patient?
    // 3. If NO grant → throw 403 "You do not have access"
    // 4. If YES grant → allow viewing
    
    const hasAccess = await accessControl.checkAccessLevelFromBlockchain(
        patientUser.walletAddress,           // Patient
        currentUser.walletAddress,           // Doctor
        2  // FULL access level minimum
    );
    
    if (!hasAccess) {
        throw new ApiError(StatusCodes.FORBIDDEN, 
            'You do not have access to this patient data'
        );
    }
};
```

```javascript
// src/middlewares/fetchGrantedPatients.js
const fetchGrantedPatients = async (req, res, next) => {
    // When doctor tries to list all records:
    // 1. Query blockchain for ALL AccessGranted events
    // 2. Filter: only events where accessor = doctor
    // 3. Filter OUT: AccessRevoked events
    // 4. Result: list of patientIds doctor can access
    
    // Get all patients with grants
    const doctorGrants = allAccessGrantedEvents.filter(event =>
        event.args.accessor.toLowerCase() === currentUser.walletAddress.toLowerCase()
    );
    
    // Remove revoked access
    const revokedPatients = new Set();
    revokedEvents.forEach(event => {
        if (event.args.accessor === currentUser.walletAddress) {
            revokedPatients.add(event.args.patient.toLowerCase());
        }
    });
    
    // Filter out revoked
    const patientAddresses = doctorGrants.filter(grant =>
        !revokedPatients.has(grant.args.patient.toLowerCase())
    );
    
    req.grantedPatients = patientIds;  // Doctor can ONLY see these patients
};
```

### **3. CONSTRAINTS SUMMARY**

| Constraint | Type | Rule | Enforcement |
|------------|------|------|-------------|
| 1 ACTIVE per patient | Database | patientId + status (ACTIVE only) | Unique Index |
| 1 ACTIVE per patient | Application | Check before create | medicalRecord.service.createNew() |
| Doctor creates record | Authorization | Role = DOCTOR | authorizeRoles middleware |
| Doctor can view | Access Control | Blockchain grant from patient | checkAccessGrant middleware |
| Doctor can list | Access Control | Blockchain grants via events | fetchGrantedPatients middleware |
| Multiple historical records | Storage | Status = COMPLETE/REVOKED allowed | ✅ Allowed (not ACTIVE) |

---

## 🎯 Permission Matrix

### **Medical Record Creation/Edit**

```
┌──────────────────────────────────────────────────────────────┐
│                     PERMISSION MATRIX                        │
├──────────────────────────────────────────────────────────────┤
│                      CREATE  │  READ  │  UPDATE  │  DELETE   │
├─────────────────────────────────────────────────────────────┤
│ DOCTOR (creator)    │   ✅   │  ✅   │   ✅    │   ❌     │
│ DOCTOR (non-creator)│   ❌   │  ✅*  │   ❌    │   ❌     │
│ PATIENT             │   ❌   │  ❓** │   ❌    │   ❌     │
│ LAB_TECH            │   ❌   │  ❌   │   ❌    │   ❌     │
│ ADMIN               │   ✅   │  ✅   │   ✅    │   ✅     │
└──────────────────────────────────────────────────────────────┘

* DOCTOR can read ONLY if patient granted access via blockchain
** PATIENT endpoint NOT YET IMPLEMENTED - unclear if should have access
```

### **Diagnosis (Medical Record) Update**

```
┌──────────────────────────────────────────────────────────────┐
│             DIAGNOSIS UPDATE (PATCH) PERMISSION              │
├──────────────────────────────────────────────────────────────┤
│ DOCTOR (creator)    │  ✅ YES - can update anytime (OFF-CHAIN) │
│ DOCTOR (other)      │  ❌ NO - not creator                     │
│ PATIENT             │  ❌ NO - no patient role access           │
│ LAB_TECH            │  ❌ NO - no access at all                 │
└──────────────────────────────────────────────────────────────┘

OFF-CHAIN: Can edit multiple times before lab interpretation
ON-CHAIN: Once interpretation posted, diagnosis is frozen (immutable)
```

---

## 📊 Access Control Flow

### **Scenario 1: Doctor A Creates Record for Patient X**

```
Flow:
1. Doctor A calls: POST /v1/doctors/patients/{patientId}/medical-records
   └─ Middleware: authorizeRoles('DOCTOR') ✅ pass
   └─ Service: createdBy = Doctor A ID

2. System:
   └─ Medical Record created with createdBy = Doctor A
   └─ Doctor A automatically has FULL access (as creator)
   └─ No blockchain grant needed

Access Result:
   ✅ Doctor A can: view, edit diagnosis
   ❌ Doctor B cannot: see the record (no grant)
   ❌ Patient X cannot: edit (no edit endpoint)
```

### **Scenario 2: Doctor B Wants to See Patient X's Record**

```
Flow:
1. Doctor B calls: GET /v1/doctors/medical-records
   └─ Middleware: fetchGrantedPatients
   └─ Query blockchain: "Who granted access to Doctor B?"
   
2. System:
   ├─ Check AccessGranted events where accessor = Doctor B
   ├─ Filter out AccessRevoked events where accessor = Doctor B
   └─ Result: patientIds that Doctor B can access

3a. If Patient X granted Doctor B:
    ✅ Doctor B appears in result list
    ✅ Doctor B can call: GET /v1/doctors/medical-records/{recordId}
    
3b. If Patient X did NOT grant Doctor B:
    ❌ Patient X not in result list
    ❌ If Doctor B tries direct call → checkAccessGrant throws 403
```

### **Scenario 3: Patient X Creates Record**

```
Flow:
1. Patient calls: POST /v1/doctors/patients/{patientId}/medical-records
   └─ Middleware: authorizeRoles('DOCTOR')
   └─ Check: Patient role = 'PATIENT' ≠ 'DOCTOR'
   └─ Result: 403 FORBIDDEN

❌ Patient CANNOT create medical record
```

---

## 🏥 Real Doctor Workflow Explanation

### **Why This Design?**

**In a real hospital:**

1. **Doctor creates record** ✅
   - Doctor does physical exam in clinic room
   - Doctor creates medical record (fast, offline OK)
   - Patient doesn't need to do anything
   - No patient permission needed (doctor is clinician - trusted)

2. **Doctor adds diagnosis** ✅
   - Based on exam findings + symptoms
   - Editable because diagnosis can change (preliminary)
   - Patient doesn't need to approve diagnosis
   - Patient approval only needed for TESTS (lab operations)

3. **Doctor creates lab order** ✅
   - After diagnosis, doctor decides which tests
   - Patient cannot dictate which tests (doctor decides)
   - But patient must CONSENT to have samples taken

4. **Patient consents to tests** ✅
   - Patient approves lab processing
   - "Yes, I agree to let lab process my sample"
   - Only for privacy protection of lab operations

5. **Doctor interprets results** ✅
   - Doctor sees lab values
   - Writes final conclusion (frozen on blockchain)
   - Patient doesn't need to approve interpretation
   - Patient might SEE interpretation (not implemented yet)

**Access Control:**

- Doctor who created record = automatic full access
- Doctor from another clinic = needs patient permission (blockchain grant)
- Patient = trusts doctor clinically (no creation/edit), may have view permission later

---

## 📋 Summary Table: Patient Permissions

| Action | By Patient? | Why |
|--------|-----------|------|
| Create medical record | ❌ NO | Doctor decides when exam is needed, patient just shows up |
| Edit diagnosis | ❌ NO | Clinical decision, doctor makes this |
| Create lab order | ❌ NO | Doctor decides tests based on diagnosis |
| **Consent to lab** | ✅ YES | Privacy: "I approve sample processing" |
| View own record | ❓ UNCLEAR | Endpoint not yet implemented - future feature |
| Grant access to another doctor | ✅ YES | Patient controls who sees their data (blockchain) |
| Revoke access from doctor | ✅ YES | Patient can remove doctor's access anytime |

---

## 🔍 Code Verification

### Where is "Only 1 ACTIVE Record" Enforced?

**Database Level:**

```javascript
File: src/models/medicalRecord.model.js (Lines 114-130)
```

**Application Level:**

```javascript
File: src/services/medicalRecord.service.js (Lines 50-70)
Method: createNew()
Logic: if (activeRecords.length > 0) throw Error
```

### Where is "Doctor Only Creates" Enforced?

**Router Level:**

```javascript
File: src/routes/v1/doctor.route.js (Line 14)
Code: Router.use(verifyToken, authorizeRoles('DOCTOR'));
```

**Request:**

```
POST /v1/doctors/patients/{patientId}/medical-records
```

**Patient cannot call this because:**

1. Role-based middleware checks: `req.user.role === 'DOCTOR'`
2. If role = 'PATIENT' → throw 403

### Where is Access Control Checked?

**For viewing specific record:**

```javascript
File: src/middlewares/checkAccessGrant.js
When: GET /v1/doctors/medical-records/:medicalRecordId
Logic: Verify blockchain grant from patient
```

**For listing records:**

```javascript
File: src/middlewares/fetchGrantedPatients.js
When: GET /v1/doctors/medical-records
Logic: Query blockchain for all patients with grants
```

---

## 📌 Conclusions

✅ **Code là chính xác - bệnh nhân KHÔNG có quyền**

1. Bệnh nhân ✅ không thể tạo medical record
2. Bệnh nhân ✅ không thể sửa diagnosis
3. Chỉ DOCTOR được tạo (middleware enforced)
4. 1 patient = 1 ACTIVE record (database + application enforced)
5. Multiple historical records allowed (after COMPLETE)
6. Doctor access control: blockchain grants required

✅ **Design này hợp lý từ góc độ lâm sàn**

- Patient không phải clinician, nên không create/edit dữ liệu lâm sàn
- Doctor là người có expertise, quyển tạo/edit medical record
- Patient chỉ cần quyền: consent để xét nghiệm + view own records

✅ **Tài liệu cần cập nhật**

- Thêm access control explanation
- Làm rõ: bệnh nhân không tạo, không sửa
- Document: 1 active vs multiple total records constraint
