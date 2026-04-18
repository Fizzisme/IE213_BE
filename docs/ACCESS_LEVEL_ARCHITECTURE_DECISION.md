# 🎯 DECISION: ACCESS LEVEL - Patient Level vs Per-Record Level

## 🤔 THE QUESTION

```
Nên để ACCESS_LEVEL ở mức bệnh nhân hay mức per-record?

Scenario:
  Patient Nguyễn Văn A có 3 records:
  - rec_001: DIABETES_TEST
  - rec_002: BLOOD_WORK
  - rec_003: PSYCHOLOGY_CONSULT
  
  Doctor Minh là:
  - Bác sĩ nội tiết (chuyên về tiểu đường)
  - Phải xem rec_001 (FULL access)
  - Không cần xem rec_003 (tâm lý)
  
  Câu hỏi:
  A) Cấp quyền làm sao?
  B) Doctor Minh có thể xem rec_002 không?
```

---

## 📊 COMPARISON TABLE

| Tiêu Chí | Patient-Level | Per-Record |
|----------|---------------|-----------|
| **Hiện thực** | ✅ Actual Code | 📋 Doc Describes |
| **Complexity** | 🟢 Simple | 🔴 Complex |
| **Database Queries** | 🟢 1 query | 🟡 N queries (N = records) |
| **Blockchain calls** | 🟢 1 call | 🔴 N calls per record |
| **Data Leak Risk** | 🟢 Binary (0 or all) | 🟡 Need field-level filtering |
| **Patient Control** | 🟡 Coarse-grained | 🟢 Fine-grained |
| **Doctor Convenience** | 🟡 All-or-nothing | 🟢 Granular |
| **Admin Overhead** | 🟢 Simple auditing | 🔴 Complex auditing |
| **Smart Contract Gas** | 🟢 Cheap | 🔴 Expensive (more storage) |

---

## 🔴 OPTION A: PATIENT-LEVEL (Hiện Tại)

### Mô Tả

```
Doctor nhận "access level" tới TẤT CẢ records của patient

Doctor Minh có quyền FULL → xem được:
  ✓ rec_001 (DIABETES) toàn bộ
  ✓ rec_002 (BLOOD_WORK) toàn bộ
  ✓ rec_003 (PSYCHOLOGY) toàn bộ

KHÔNG thể: "cho xem rec_001 FULL nhưng rec_003 chỉ READ_RESULTS"
```

### 👍 Ưu Điểm

#### 1️⃣ **Blockchain Efficiency** (Gas Cost)

```
Per-record: Phải ghi N grants lên blockchain (1000 records = 1000 smart contract calls)
Patient-level: 1 grant duy nhất trên blockchain (1 call)

Gas cost: ~50% thấp hơn
```

#### 2️⃣ **Xquery Simplicity**

```javascript
// Patient-level (Simple)
const records = await MedicalRecord.find({ patientId });
const grant = await blockchainContracts.checkAccess(patientAddress, doctorAddress);
if (grant.isActive) return records;  // ← 1 check

// Per-record (Complex)
const records = await MedicalRecord.find({ patientId });
for (let record of records) {
  const grant = await blockchainContracts.checkAccess(patientAddress, doctorAddress, recordId);
  record.accessible = grant.isActive;  // ← N checks
}
```

#### 3️⃣ **Security - Binary Access**

```
Patient-level = Binary: Doctor FULL (2) hoặc SENSITIVE (3) hoặc NOTHING

❌ KO CÓ trường hợp: "Xem diagnosis nhưng không xem notes"
✅ LESS BUGS: Không cần filter từng field
✅ LESS LEAKS: Ít nơi quên filter (1 query > N query)

Per-record = Phải filter theo field-level
⚠️ Dễ quên: Doctor này có READ_RESULTS cho rec_001 nhưng ko có cho rec_002
   => Nếu query sai → Leak data từ rec_002
```

#### 4️⃣ **Practical Scenario - Hospital Workflow**

```
Phòng cấp cứu: "Cho phép doctor XYZ xem TẤT CẢ dữ liệu bệnh nhân này"
  - Per-patient: 1 grant → Doctor xem full
  - Per-record: 50 grants (nếu patient có 50 records)
  
Workflow: Tay phần mềm cấp quyền trên UI
  - Patient-level: Click "Grant" → 1 blockchain call
  - Per-record: 50 modal dialog → 50 blockchain calls
  
UX là sao?
```

#### 5️⃣ **Audit Trail Simplicity**

```
Patient-level:
  ↓
  Grant: Doctor Minh → FULL access từ 09:00 → 18:00
  Revoke: Doctor Minh → access revoked at 18:00
  
  Clear authority chain: Patient → Doctor Minh → FULL

Per-record:
  ↓
  Grant rec_001: Doctor Minh → FULL
  Grant rec_002: Doctor Minh → READ_RESULTS
  Grant rec_003: Doctor Minh → NONE
  ...
  Grant rec_50: Doctor Minh → SENSITIVE
  
  Complex: Nếu hacker modify record 3 grants → Cần track 50 khác
```

### 👎 Nhược Điểm

#### 1️⃣ **Không Granular Control**

```
Doctor Minh xem được TẤT CẢ + KHÔNG thể xem CHỈ psychology

Scenario: Bệnh nhân đến
  "Doctor Minh, bạn là bác sĩ nội tiết. Bạn chỉ cần DATA TIỂU ĐƯỜNG thôi."
  "Dữ liệu tâm lý với mô hình mô học kỹ tính = không cần cho bạn"
  
→ Nhưng Patient-level system: "Tất cả hoặc không có gì"
  Phải chọn: FULL (bao gồm cả tâm lý) hoặc NOTHING
```

#### 2️⃣ **Privacy Concern - Vô Ý Leak**

```
Bệnh nhân:
"Cho Doctor Minh xem kiểm tra tiểu đường"

Patient-level → Doctor Minh get FULL + xem cả:
  - Điều trị tâm lý (2023)
  - Phẫu thuật phụ khoa (2024)
  - Kết quả test HIV (2025)
  
⚠️ Bệnh nhân KHÔNG muốn doctor khác chuyên ngành biết
```

#### 3️⃣ **Không Có Fine-Tuning**

```
Bệnh nhân muốn:
  - Doctor A: Xem TẤT CẢ (FULL)
  - Doctor B: Chỉ xem test results (READ_RESULTS)
  - Lab Tech: Chỉ xem diagnosis (READ_DIAGNOSIS)

Per-patient system:
  ✅ CÓ THỂ: Doctor A=FULL, Doctor B=SENSITIVE, Lab Tech=SENSITIVE
  ❌ KHÔNG THỂ: Doctor B xem REC_001 (RESULTS) nhưng REC_002 (NO ACCESS)
```

---

## 🟢 OPTION B: PER-RECORD (Doc Describes)

### Mô Tả

```
Patient cấp quyền cho TỪNG RECORD một cách riêng lẻ

Patient Nguyễn Văn A:
  ├─ rec_001: Doctor Minh (FULL)
  ├─ rec_002: Doctor Minh (READ_RESULTS) ← khác nhau
  └─ rec_003: (none - không share)

Doctor Minh xem:
  rec_001 → FULL (all fields)
  rec_002 → READ_RESULTS (chỉ test results)
  rec_003 → DENIED (không có quyền)
```

### 👍 Ưu Điểm

#### 1️⃣ **Granular Control**

```javascript
// Patient control by record
Patient: "Cho Doctor Minh:"
  - rec_001 (tiểu đường): FULL
  - rec_002 (mô phỏng): READ_DIAGNOSIS only
  - rec_003 (tâm lý): NONE

Doctor Minh xem được EXACT những gì patient chỉ định
```

#### 2️⃣ **Privacy by Default**

```
Bệnh nhân: "Doctor Minh xem kiểm tra tiểu đường thôi"

Per-record system:
  Grant rec_001 → FULL ✅
  Doctor KHÔNG thể xem rec_002, rec_003

Privacy respected: Doctor được đúng cái cần
```

#### 3️⃣ **Specialist Workflow**

```
Scenario: Bệnh nhân có bệnh phức tạp

Patient được khám:
  - Doctor A (nội tiết): Cần full rec_001 (tiểu đường)
  - Doctor B (tim mạch): Cần full rec_002 (huyết áp)
  - Lab Tech: Cần READ_RESULTS rec_001 + rec_002
  - Admin: Cần RESTRICTED rec_001 (status only)

Per-record:
  ✅ PERFECT: Cấp quyền chính xác cho mỗi specialist

Per-patient:
  ❌ PROBLEM: Level phải "universal" cho tất cả records
     e.g., nếu cấp FULL → Lab Tech có quyền quá
            nếu cấp SENSITIVE → Doctor cần FULL không có
```

#### 4️⃣ **Compliance & Audit**

```
Compliance requirement: "Patient có quyền kiểm soát từng dòng dữ liệu"

Per-record:
  ✅ CLEAR AUDIT TRAIL:
    - Bệnh nhân cấp quyền REC_001 cho Doctor Minh (FULL)
    - Doctor Minh xem REC_001 → Ghi log
    - Doctor Minh TRY xem REC_002 → DENIED, ghi log

Per-patient:
  ⚠️ COARSE-GRAINED:
    - Bệnh nhân cấp quyền FULL cho Doctor Minh
    - Doctor Minh xem REC_001 + REC_002 + REC_003
    - Không biết patient chỉ muốn share REC_001
```

### 👎 Nhược Điểm

#### 1️⃣ **Blockchain Cost (Gas)**

```
Patient có 100 records, grant cho Doctor:

Per-patient:
  → 1 smart contract call
  → 1 storage entry: mapping[patient][doctor] = level

Per-record:
  → 100 smart contract calls
  → 100 storage entries: mapping[patient][doctor][rec1] = level
                          mapping[patient][doctor][rec2] = level
                          ...

Gas cost percentage:
Sepolia testnet: ~10x-20x mắc hơn (mỗi call ~21k gas, storage ~5k per entry)

Mainnet: ~100x-200x mắc hơn

Cost impact: Bệnh nhân phải trả tiền gas? ❌ Không thể đẩy lên user
```

#### 2️⃣ **Query Complexity**

```javascript
// Doctor xem records của patient

Per-record (phải query mỗi record):
const grants = await AccessGrant.find({
  patientId, doctorAddress
});  // [
       //   { recordId: rec_001, level: FULL },
       //   { recordId: rec_002, level: READ_RESULTS },
       //   ...
       // ]

for (let record of records) {
  const grant = grants.find(g => g.recordId === record._id);
  record.accessLevel = grant?.level || null;
}

// N database lookups + filtering
// vs

Per-patient (1 check):
const grant = await accessControl.checkAccess(patientAddress, doctorAddress);
const records = record.find({ patientId });

// 1 blockchain call + 1 query
```

#### 3️⃣ **UX Complexity**

```
Patient grant UI:

Per-patient:
  [Patient] → [Doctor Minh] → [Grant] → Lịch sử
  1 modal, 1 button

Per-record:
  [Patient] 
    ├─ rec_001 → [Doctor Minh] → [Grant/Deny] → [Select Level]
    ├─ rec_002 → [Doctor Minh] → [Grant/Deny] → [Select Level]
    ├─ rec_003 → [Doctor Minh] → [Grant/Deny] → [Select Level]
    ...
  
  50 records = 50 dialogs?
  UX sẽ rất phức tạp
```

#### 4️⃣ **Admin Management**

```
Scenario: Revoke access

Per-patient:
  → 1 command: revoke doctor access to patient
  → Done

Per-record:
  → 50 commands: revoke doctor for each record
  → If revoke incomplete → Data leak
  → More error-prone
```

#### 5️⃣ **Smart Contract Complexity**

```solidity
// Per-patient (Simple)
mapping(address patient => mapping(address doctor => AccessGrant)) grants;

// Per-record (Complex)
mapping(address patient => mapping(address doctor => 
  mapping(bytes32 recordId => AccessGrant))) grants;

// Nested 3 levels → More storage, more gas, more bugs
```

---

## 🎯 REAL-WORLD SCENARIOS

### Scenario 1: Emergency Room (ER)

```
Patient được đưa vào ER, nguy hiểm tính mạng

Per-patient:
  ✅ Admin grant: Doctor ER = FULL access
  ✅ 1 grant → doctor see all records immediately
  ✅ Fast decision making

Per-record:
  ❌ Admin must grant 50+ records (if patient has many)
  ❌ Delay while granting
  ❌ Risk of incomplete grant → Doctor cannot see critical info
```

**Winner: Per-patient** 🏆

---

### Scenario 2: Specialist Clinic

```
Patient appointment kế tiếp:
  1. Doctor A (nội tiết): Check tiểu đường
  2. Doctor B (tim mạch): Check huyết áp
  3. Doctor C (tổng hợp): Tổng kết

Patient muốn:
  - Doctor A xem ONLY tiểu đường records
  - Doctor B xem ONLY tim mạch records
  - Doctor C xem ALL

Per-patient:
  ❌ Cannot do ONLY - level mặc định toàn bộ

Per-record:
  ✅ Grant tiểu đường → Doctor A (FULL)
  ✅ Grant tim mạch → Doctor B (FULL)
  ✅ Grant all → Doctor C (FULL)
```

**Winner: Per-record** 🏆

---

### Scenario 3: Mental Health + Physical Health

```
Patient vừa có:
  1. Regular physical checkup
  2. Mental health therapy notes
  3. Physical rehabilitation

Patient privacy concern:
  - "Doctor A (therapist) không cần biết về bệnh tim"
  - "Doctor B (cardiologist) không cần biết về tâm lý"

Per-patient:
  ❌ Grant to therapist → therapist sees everything
  ❌ Patient privacy violated

Per-record:
  ✅ therapy notes → Therapist only
  ✅ cardiac tests → Cardiologist only
  ✅ Physical rehab → Both (but not mental)
```

**Winner: Per-record** 🏆

---

### Scenario 4: Hospital Audit

```
Compliance: "Audit phải biết chính xác ai xem cái gì khi nào"

Per-patient:
  Log: Doctor Minh access Patient A, level=FULL
  ❓ Doctor xem rec_001 hay rec_003?
  ❓ Appropriate access hay not?
  → Cannot verify without checking system logs detail

Per-record:
  Log: Doctor Minh access PatientA/rec_001, level=FULL
  ✅ Clear: Doctor xem đúng cái được grant
```

**Winner: Per-record** 🏆

---

## 💡 HYBRID APPROACH: Smart Default + Override

```javascript
// Por-patient mặc định (simple, fast)
// Có tuỳ chọn per-record nếu patient request (granular)

const accessModel = {
  default: "PATIENT_LEVEL",  // Default: FULL or NOTHING
  
  optionalPerRecord: true,   // If patient wants granular
  
  usage: {
    emergency: "use PATIENT_LEVEL (fast)",
    normal: "use PATIENT_LEVEL (simple)",
    sensitive: "use PER_RECORD (privacy)"
  }
};

// Patient có toggle:
// "Enable granular per-record access control?" [ON/OFF]
//
// ON → Per-record UI (complex but granular)
// OFF → Patient-level UI (simple, fast)
```

---

## 🏆 FINAL RECOMMENDATION

### ✅ **USE PATIENT-LEVEL** (Current Implementation)

**Reasoning:**

| Điểm | Kết Luận |
|------|----------|
| **Practicality** | 🟢 90% use cases là cấp FULL hoặc NOTHING |
| **Cost** | 🟢 10-20x rẻ hơn trên blockchain |
| **Speed** | 🟢 Grant/revoke instant (1 call) |
| **UX** | 🟢 Patient đơn giản → "Grant full or none" |
| **Security** | 🟢 Binary access = ít bugs |
| **Audit** | 🟢 Clear authority chain |
| **Emergency** | 🟢 Perfect for ER scenarios |
| **Maintenance** | 🟢 Simple code, few places to leak |

**But add per-record OPTION:**

```javascript
// Phase 2 (Future Enhancement):
// "I want granular control (advanced)"
// → Enable per-record override for specific doctors

PatientSettings {
  accessControlMode: "SIMPLE" (default)  // PATIENT_LEVEL only
                 or "ADVANCED"           // PATIENT_LEVEL + per-record override
}

// If ADVANCED:
//   Base: Patient-level (default)
//   Override: Per-record for selected doctors
//
// Example:
//   Doctor Minh: FULL (patient-level)
//   Doctor Vân: base SENSITIVE
//               override rec_001 → FULL (exception)
//               override rec_003 → NONE (deny)
```

### Why This Recommendation

1. **Pareto Principle**: 80% benefits with 20% complexity
2. **MVP First**: Start simple, add complexity later if needed
3. **Cost**: Save blockchain gas for real healthcare (not frivolous)
4. **UX**: Patient doesn't need 50 dialogs for 50 records
5. **Security**: Simpler = fewer bugs = safer

### If Patient MUST Have Per-Record

→ Consider:

- Limit grants (e.g., max 10 different doctors)
- Batch grants (e.g., grant all records with single checkbox)
- Use off-chain database + occasional blockchain sync (not realtime)
- Partner with blockchain that's cheaper (Polygon, Arbitrum vs Ethereum)

---

## 📝 ACTION ITEMS

### ✅ Keep Current: Patient-Level

```javascript
// src/services/accessControl.service.js
// Current: grantAccess(patientAddress, doctorAddress, level)
// ✅ KEEP THIS

// No change needed
```

### ✅ Document Decision

```markdown
// docs/ACCESS_CONTROL_ARCHITECTURE.md
// Explain WHY we use patient-level
// Explain cost/benefit tradeoff
// Mention per-record as future enhancement
```

### 🔄 Document Per-Record as Future Feature

```javascript
// In backlog / roadmap:
// "Phase 2 Feature: Advanced granular control"
// - Only enable for specific hospitals/patients who request
// - Use off-chain database for per-record tracking
// - Sync to blockchain nightly (not realtime)
```

---

## 📊 Financial Impact Example

```
Patient: 1000 records
Doctor grants: 10 doctors

Per-patient:
  Gas cost: 10 grants × $0.01 = $0.10
  
Per-record:
  Gas cost: 10 × 1000 = 10,000 grants × $0.01 = $100
  
Difference: $99.90 per patient
10,000 patients: $999,000 cost difference

→ Not sustainable unless patient pays
```

---

## 🎯 CONCLUSION

| Component | Decision | Reason |
|-----------|----------|--------|
| **Primary Model** | ✅ Patient-Level | Simple, cheap, fast |
| **Future Enhancement** | 📋 Per-Record Option | For privacy-conscious patients |
| **Default Setting** | ✅ Patient-Level | Keep UX simple |
| **Storage** | ✅ Blockchain (current) | Immutable + auditable |
| **Documentation** | 🔄 Update to explain decision | Help future devs understand |
