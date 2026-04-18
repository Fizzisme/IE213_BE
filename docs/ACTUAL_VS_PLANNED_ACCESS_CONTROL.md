# ⚠️ Actual Implementation vs Planned Doc - Access Control Comparison

## 🎯 SUMMARY: MAJOR DIFFERENCE FOUND

| Aspiration  | Doc Describes | Actual Code | Status |
|-------------|---------------|-------------|--------|
| **Granularity** | Per-Record | Per-Patient | ❌ DIFFERENT |
| **Storage** | MongoDB (AccessGrant collection) | Blockchain (AccessControl.sol) | ❌ DIFFERENT |
| **Access Levels** | 5 levels (FULL, READ_RESULTS, READ_DIAGNOSIS, READ_NOTES, RESTRICTED) | 2 levels (FULL=2, SENSITIVE=3) | ❌ DIFFERENT |
| **Parameters** | `granteeAddress`, `accessLevel`, `recordId`, `expiryDate` | `accessorAddress`, `level`, `durationHours` | ❌ DIFFERENT |
| **Per-Record Access** | ✅ YES (doctor có quyền khác nhau cho records khác nhau) | ❌ NO (doctor có quyền TOÀN BỘ hoặc NHẠY CẢM) | ❌ NOT IMPLEMENTED |

---

## 🔴 CHI TIẾT KHÔNG KHỚP

### **Doc Says (Lý Tưởng):**

```javascript
// Mỗi record có grants riêng
POST /v1/patients/me/medical-records/rec_001/grant
{
  "granteeAddress": "0x862...",
  "accessLevel": "READ_RESULTS"  // Chỉ READ_RESULTS cho record này
}

POST /v1/patients/me/medical-records/rec_002/grant
{
  "granteeAddress": "0x862...",
  "accessLevel": "FULL"  // FULL cho record khác
}

// Cùng doctor nhưng access khác nhau tùy record
//Doctor Minh → rec_001: READ_RESULTS
//Doctor Minh → rec_002: FULL
```

### **Actual Code (Thực Tế):**

```javascript
// Chỉ có per-patient grants
POST /v1/access-control/grant
{
  "accessorAddress": "0x862...",
  "level": "FULL",  // Hoặc "SENSITIVE" (level=3)
  "durationHours": 24
}

// Ghi lên blockchain - không có "recordId"
// Doctor xem được TẤT CẢ medical records của patient
// hoặc chỉ xem được những SENSITIVE data nhạy cảm

// Blockchain storage: 
mapping(address patient => mapping(address accessor => AccessGrant))
// NO RECORD ID - chỉ patient→accessor
```

---

## 📊 DETAILED COMPARISON

### 1️⃣ Medical Record Model

#### **Doc Description:**

```javascript
{
  _id: ObjectId,
  patientId: ObjectId,
  patientAddress: String,              // ❌ NOT IN CODE
  type: String,
  diagnosis: String,
  clinicalNotes: String,
  createdBy: ObjectId,
  createdByAddress: String,            // ❌ NOT IN CODE
  accessLog: [{...}],                  // ❌ NOT IN CODE
  recordHash: String,                  // ❌ NOT IN CODE
  blockchainTxHash: String             // ❌ NOT IN CODE
}
```

#### **Actual Code:**

```javascript
{
  _id: ObjectId,
  patientId: ObjectId,              // ✅ OK
  type: String,                     // ✅ OK
  status: String,                   // ✅ OK
  diagnosis: String,                // ✅ OK
  confirmedDiagnosis: String,       // ✅ OK (extra - diagnosis workflow)
  diagnosisHistory: [...],          // ✅ OK (extra - audit trail)
  createdBy: ObjectId,              // ✅ OK
  testResultId: ObjectId,           // ✅ Extra field
  interpretationHash: String,       // ✅ OK (blockchain link)
  
  // ❌ MISSING from actual code (doc expected these):
  // - patientAddress (blockchain wallet)
  // - createdByAddress (doctor's wallet)
  // - accessLog (who viewed this record)
  // - recordHash (full record hash)
  // - blockchainTxHash (when record was created on chain)
}
```

### 2️⃣ Access Control Storage

#### **Doc Expects:**

MongoDB Collection: `accessGrants`

```javascript
{
  _id: ObjectId,
  patientAddress: String,
  granteeAddress: String,
  recordId: ObjectId,          // 🔑 KEY - per-record grants
  accessLevel: String,         // Enum: FULL, READ_RESULTS, READ_DIAGNOSIS, READ_NOTES
  expiryDate: Date,
  status: String,
  blockchainTxHash: String,
  messageHash: String
}
```

#### **Actual Implementation:**

Blockchain Storage (AccessControl.sol):

```solidity
struct AccessGrant {
  address accessor,
  AccessLevel level,           // Enum: FULL=2, SENSITIVE=3
  uint64 grantedAt,
  uint64 expiresAt,
  bool isActive
}

mapping(address patient => mapping(address accessor => AccessGrant))
// 🔑 NO recordId - grants are per-patient, not per-record
```

**Consequence:**

```
Doc: Doctor A có quyền READ_RESULTS cho record 1, FULL cho record 2
Actual: Doctor A có quyền FULL (level=2) cho TẤT CẢ records của patient
        Hoặc chỉ quyền SENSITIVE (level=3) cho TẤT CẢ records
```

### 3️⃣ Access Levels Definition

#### **Doc Says (5 levels):**

```javascript
ACCESS_LEVELS = {
  FULL: { canView: ["diagnosis", "notes", "results", "attachments"] },
  READ_RESULTS: { canView: ["testResults"] },
  READ_DIAGNOSIS: { canView: ["diagnosis", "testResults"] },
  READ_NOTES: { canView: ["clinicalNotes"] },
  RESTRICTED: { canView: ["status", "type"] }
}
```

#### **Actual Code (2 levels):**

```javascript
// In blockchain (AccessLevel enum)
FULL = 2         // Can access all data
SENSITIVE = 3    // Can access sensitive data (in doc = "RESTRICTED"?)

// Parameter mapping:
level === 'FULL' → accessLevel = 2
level === 'SENSITIVE' → accessLevel = 3
```

---

## 🔍 API ENDPOINT COMPARISON

### **Doc Planned Endpoints:**

```
Patient APIs:
✅ GET /v1/patients/me/medical-records → all records (patient sees all)
✅ GET /v1/patients/me/medical-records/:recordId → detail (all fields)
⭐ POST /v1/access-control/grant → grant PER-RECORD with specific accessLevel
⭐ GET /v1/patients/me/grants-given → see all grants I gave
⭐ PATCH /v1/access-control/revoke/:grantId → revoke specific grant

Doctor APIs:
⭐ GET /v1/doctors/me/accessible-records → see records I can access (filtered by grants)
⭐ GET /v1/doctors/me/accessible-records/:recordId → see detail (filtered by accessLevel)
⭐ GET /v1/doctors/me/grants-received → see grants I received

Blockchain Query:
⭐ POST /v1/access-control/verify → verify grant on blockchain
```

### **Actual Endpoints (From Code):**

```
Patient APIs:
✅ POST /v1/access-control/grant 
   Body: { accessorAddress, level, durationHours }
   // NOT per-record, per-patient only

✅ PATCH /v1/access-control/update
   Body: { accessorAddress, level, durationHours }
   // Update existing grant

✅ PATCH /v1/access-control/revoke
   Body: { accessorAddress }
   // Revoke grant for this accessor

✅ POST /v1/access-control/check
   Body: { accessorAddress }
   // Check if accessor has access

✅ POST /v1/access-control/get
   Body: { accessorAddress }
   // Get grant details

✅ GET /v1/access-control/my-grants
   // Get all grants I gave (patient)
   
Medical Record APIs:
✅ POST /v1/doctors/patients/:patientId/medical-records
✅ PATCH /v1/doctors/medical-records/:recordId/diagnosis
✅ GET /v1/doctors/patients/:patientId/medical-records/:recordId
// BUT NO filtering by accessLevel!
```

---

## 🎯 WHAT'S ACTUALLY WORKING

### ✅ What IS Implemented Correctly

1. **Blockchain-based grants** - Stored on AccessControl.sol (prevents tampering)
2. **Patient grants access to Doctor** - Using wallet signature
3. **Auto-revoke pattern** - Revokes old grant before granting new
4. **Audit logging** - All grant actions logged
5. **Expiry dates** - Grants can expire
6. **Notifications** - Doctor gets notified when granted access
7. **Diagnosis workflow** - Initial diagnosis + confirmed diagnosis + history tracking

### ❌ What's Missing vs Doc

1. **Per-record access control** ❌
   - Doc describes: Different access levels for different records
   - Actual: All records have same access level for a doctor

2. **Access level filtering** ❌
   - Doc describes: Backend filters data based on READ_RESULTS vs READ_DIAGNOSIS
   - Actual: No per-record filtering in controllers

3. **MongoDB AccessGrant collection** ❌
   - Doc describes: Separate collection for grants
   - Actual: Grants stored only on blockchain, not in MongoDB

4. **Access log on records** ❌
   - Doc describes: `accessLog` field showing who viewed what and when
   - Actual: No access logging on records

5. **Detailed access levels** ❌
   - Doc describes: 5 levels (FULL, READ_RESULTS, READ_DIAGNOSIS, READ_NOTES, RESTRICTED)
   - Actual: 2 levels (FULL, SENSITIVE)

---

## 🛠️ WHAT SHOULD HAPPEN - ACTION ITEMS

### Option A: Update Doc to Match Reality ✅ RECOMMENDED

```markdown
# Actual Access Control Model

- Grants are PER-PATIENT (not per-record)
- 2 access levels: FULL, SENSITIVE
- Stored on blockchain (AccessControl.sol)
- When doctor gets access, they can see all records with that level
- No per-record filtering needed
```

### Option B: Update Code to Match Doc ⚠️ MORE WORK

Need to implement:

1. Add `recordId` to blockchain AccessGrant struct
2. Create MongoDB AccessGrant collection for local tracking
3. Add `patientAddress`, `createdByAddress` to MedicalRecord
4. Implement `filterByAccessLevel()` in controllers
5. Add `accessLog` field to MedicalRecord
6. Refactor all doctor record endpoints to check grants

---

## 📋 CURRENT STATE - WORKING WITH BLOCKCHAIN

```
Patient: 0x709...
├─ Doctor 0x862...     → level=FULL (blockchain)
│  Can access:
│  ├─ rec_001 (ALL fields)
│  ├─ rec_002 (ALL fields)
│  └─ rec_003 (ALL fields)
│
├─ Doctor 0x888...     → level=SENSITIVE (blockchain)
│  Can access:
│  ├─ rec_001 (SENSITIVE fields only)
│  ├─ rec_002 (SENSITIVE fields only)
│  └─ rec_003 (SENSITIVE fields only)
│
└─ Lab Tech 0x999...   → level=FULL (blockchain)
   Can access:
   ├─ rec_001 (ALL fields)
   ├─ rec_002 (ALL fields)
   └─ rec_003 (ALL fields)

// KO THỂ làm: Doctor 0x862... xem FULL trên rec_001, nhưng READ_RESULTS trên rec_002
// (Current system không support per-record level)
```

---

## 🎓 RECOMMENDATION

**Keep the current simpler implementation because:**

1. ✅ Simpler to understand and maintain
2. ✅ Blockchain-native (more secure)
3. ✅ Fewer database operations
4. ✅ Fewer API endpoints needed

**But update the doc (MEDICAL_RECORD_ACCESS_LEVELS_EXPLAINED.md) to:**

1. ✅ Explain per-patient grants (not per-record)
2. ✅ Show 2 levels: FULL, SENSITIVE
3. ✅ Clarify blockchain storage
4. ✅ Remove mentions of recordId in grants
5. ✅ Simplify the examples

**OR if you NEED per-record control:**

- This requires significant backend changes
- Will need to modify smart contract
- Will need more MongoDB code
- More complex filtering logic

---

## 📝 ACTUAL ACCESS CONTROL FLOW (What Really Happens)

```
1. Patient calls: POST /v1/access-control/grant
   {
     "accessorAddress": "0x862...",
     "level": "FULL"
   }

2. Backend calls: blockchainContracts.patient.accessControl.grantAccess(
     accessorAddress= "0x862...",
     level= 2,  // FULL
     durationHours= 0  // unlimited
   )

3. Smart Contract stores:
   accessGrants[0x709...][0x862...] = { 
     level: 2, 
     expiresAt: 0,
     isActive: true 
   }

4. Doctor queries on login:
   const grant = await contract.getAccessGrant(patientAddress, doctorAddress)
   // grant = { level: 2, isActive: true }

5. Doctor can now view ALL records of patient
   // No per-record checking because level applies to all records
```

---

**Conclusion:** Doc describes ideal future state, but actual code implements simpler blockchain-native approach. ✅ Works well, just documented differently.
