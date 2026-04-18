# 🏗️ EHR Blockchain System - Architecture Overview

**Mục đích:** Giải thích tổng quan nguyên tắc thiết kế hệ thống EHR blockchain - tại sao thiết kế theo hướng Hash-on-Chain, Data-off-Chain.

---

## 🎯 Bài Toán Cốt Lõi

```
Cần giải quyết bài toán:
┌────────────────────────────────────────────────────────────┐
│  Làm sao CÓ AUDIT TRAIL BẤT BIẾN                           │
│  (không ai sửa được lịch sử)                               │
│                                                             │
│  MÀ KHÔNG LỘ DỮ LIỆU NHẠY CẢM                              │
│  (glucose, A1C, nhóm máu, ...)                             │
└────────────────────────────────────────────────────────────┘

Câu trả lời:
┌────────────────────────────────────────────────────────────┐
│  Blockchain lưu HASH (bằng chứng)                          │
│  MongoDB lưu DỮ LIỆU (thông tin chi tiết)                  │
│                                                             │
│  ✅ Hash on-chain → Immutable audit trail                  │
│  ✅ Data off-chain → Private, encrypted                    │
│  ✅ Verify: hash(current_data) == blockchain_hash          │
└────────────────────────────────────────────────────────────┘
```

---

## 📋 Kiến Trúc Hệ Thống - 3 Lớp

```
┌──────────────────────────────────────────────────────────────────┐
│                      LAYER 1: ACCESS CONTROL                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Blockchain: AccessControl.sol                                   │
│  ├─ Patient grants access to Doctor                              │
│  ├─ Grant stored: grants[patientWallet][doctorWallet]           │
│  ├─ Doctor cannot read data WITHOUT grant                        │
│  └─ Revocation is immutable + auditable                          │
│                                                                   │
│  Purpose: WHO can access WHAT (authorization)                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  LAYER 2: WORKFLOW STATE MACHINE                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Blockchain: EHRManager.sol                                      │
│  ├─ recordId (identity)                                          │
│  ├─ Status: ORDERED → CONSENTED → IN_PROGRESS → ...            │
│  ├─ 3 hashes (proof of integrity):                               │
│  │  ├─ orderHash (doctor's order proof)                          │
│  │  ├─ labResultHash (lab tech's result proof)                   │
│  │  └─ interpretationHash (doctor's interpretation proof)        │
│  └─ Events: RecordAdded, RecordUpdated, InterpretationAdded    │
│                                                                   │
│  Purpose: WORKFLOW tracking + INTEGRITY verification            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    LAYER 3: MEDICAL DATA                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  MongoDB (Off-Chain):                                            │
│  ├─ labOrders: FULL order metadata                               │
│  │  ├─ testsRequested: ["GLUCOSE", "A1C", "CBC"]                │
│  │  ├─ clinicalNote: "Bệnh nhân có triệu chứng..."              │
│  │  ├─ diagnosisCode: "E11.9"                                    │
│  │  └─ sampleType: "blood"                                       │
│  │                                                                │
│  ├─ testResults: FULL test values                                │
│  │  ├─ glucose: "285 mg/dL"                                      │
│  │  ├─ a1c: "9.2%"                                               │
│  │  ├─ wbc: "7.5 K/uL"                                           │
│  │  └─ hemoglobin: "14.2 g/dL"                                   │
│  │                                                                │
│  └─ medicalRecords: FULL interpretation                          │
│     └─ clinicalInterpretation: "Glucose cao, A1C cao..."        │
│                                                                   │
│  Purpose: CLINICAL USE (fast, private, editable)                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Data Flow - 4 Bước (Patient-Centric)

### BƯỚC 1: Doctor Tạo Lab Order

```
┌──────────────────────────────────┐
│ Doctor POSTs /lab-orders         │
│ {                                │
│   tests: [GLUCOSE, A1C, CBC]    │
│   priority: "normal"             │
│   clinicalNote: "..."            │
│ }                                │
└──────────────────────────────────┘
           ↓
      ┌────┴────┐
      ↓         ↓
      
   ✅ MongoDB    ✅ Blockchain
   
   Lưu:         1. Compute:
   - tests        orderHash = Keccak256(metadata)
   - priority   
   - note       2. Send Transaction:
   - code         addRecord(
   - sampleType   patient_address,
                  DIABETES_TEST,
   Full DỮ LIỆU   orderHash ← CHỈ HASH
                )
   
                3. State:
                   records[1] = {
                     orderHash: 0x1a2b...,
                     status: ORDERED,
                     patient: 0xPATIENT...,
                     author: 0xDOCTOR...
                   }
```

**Kết quả:**

- MongoDB: Toàn bộ dữ liệu chi tiết (private)
- Blockchain: HASH + metadata (immutable)

---

### BƯỚC 2: Patient Gives Consent (⭐ Patient-Centric)

```
┌──────────────────────────────────┐
│ Patient Reviews Order & Clicks OK│
└──────────────────────────────────┘
           ↓
┌──────────────────────────────────┐
│ Patient POSTs /consent/{recordId}│
└──────────────────────────────────┘
           ↓
      ┌────┴────┐
      ↓         ↓
      
   ✅ MongoDB    ✅ Blockchain
   
   Update:      1. Verify:
   - Status       - Only PATIENT can call
     CONSENTED    - Status is ORDERED
               
   Log:         2. Update Status:
   - Who        - ORDERED → CONSENTED
   - When       
               3. Emit Event:
               - PatientConsented(...)
               - Immutable audit trail
                   
                State:
                records[1] = {
                  status: CONSENTED,
                  updatedAt: 11:00:15
                }
```

**CÓ Ý NGHĨA TỒN TẠI:**

- ✅ Patient MUST approve before lab work
- ✅ If patient rejects → no lab tech access
- ✅ Immutable consent record on blockchain
- ✅ GDPR compliant: patient in control

---

### BƯỚC 3: Lab Tech Post Test Results

```
┌──────────────────────────────────┐
│ Lab Tech POSTs /test-results     │
│ (AFTER patient consented)        │
│ {                                │
│   glucose: "285 mg/dL"          │
│   a1c: "9.2%"                    │
│   cbc: {...}                     │
│ }                                │
└──────────────────────────────────┘
           ↓
      ┌────┴────┐
      ↓         ↓
      
   ✅ MongoDB    ✅ Blockchain
   
   Lưu:         1. Compute:
   - glucose      labResultHash = 
     285          Keccak256(all results)
   - a1c 9.2%   
   - cbc data   2. Send Transaction:
                  postLabResult(
   All VALUES     recordId,
   (sensitive)    labResultHash ← CHỈ HASH
                )
   
                3. State:
                   records[1] = {
                     orderHash: 0x1a2b...,
                     labResultHash: 0xaa...,
                     status: IN_PROGRESS
                   }
```

**Kết quả:**

- MongoDB: Tất cả giá trị xét nghiệm (glucose, A1C, etc)
- Blockchain: labResultHash (immutable proof)

---

### BƯỚC 4: Doctor Adds Interpretation

```
┌──────────────────────────────────┐
│ Doctor POSTs /interpretation     │
│ {                                │
│   text: "Glucose cao, A1C cao... │
│   Tiểu đường type 2..."          │
│ }                                │
└──────────────────────────────────┘
           ↓
      ┌────┴────┐
      ↓         ↓
      
   ✅ MongoDB    ✅ Blockchain
   
   Lưu:         1. Compute:
   - Full text    interpretationHash = 
                  Keccak256(text)
   Dài,
   chi tiết   2. Send Transaction:
              addClinicalInterpretation(
              recordId,
              interpretationHash ← CHỈ HASH
              )
              
              3. Final State:
                 records[1] = {
                   orderHash: 0x1a2b...,
                   labResultHash: 0xaa...,
                   interpretationHash: 0x99...,
                   status: DOCTOR_REVIEWED
                 }
```

**Kết quả:**

- MongoDB: Full interpretation text (private)
- Blockchain: 3 hashes = 3 lớp bằng chứng tính toàn vẹn

---

## 🔐 Verification Cơ Chế

### Khi Cần Xác Minh: "Dữ Liệu Có Bị Sửa Không?"

```
┌─────────────────────────────────────────────────┐
│ STEP 1: Get Current Data from MongoDB           │
├─────────────────────────────────────────────────┤
│                                                  │
│ testResults = db.find({})                      │
│ {                                               │
│   glucose: "285 mg/dL",                        │
│   a1c: "9.2%",                                 │
│   wbc: "7.5 K/uL"                              │
│ }                                               │
└─────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────┐
│ STEP 2: Compute Hash Locally                    │
├─────────────────────────────────────────────────┤
│                                                  │
│ computedHash = Keccak256(testResults)          │
│ = "0xaabbccdd11223344..."                      │
└─────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────┐
│ STEP 3: Get Blockchain Hash                     │
├─────────────────────────────────────────────────┤
│                                                  │
│ record = blockchain.records(recordId)           │
│ blockchainHash = record.labResultHash           │
│ = "0xaabbccdd11223344..."                      │
└─────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────┐
│ STEP 4: Compare                                 │
├─────────────────────────────────────────────────┤
│                                                  │
│ if (computedHash === blockchainHash) {         │
│   ✅ Data is AUTHENTIC (not modified)          │
│ } else {                                        │
│   ❌ WARNING: Data has been MODIFIED!          │
│ }                                               │
└─────────────────────────────────────────────────┘
```

### Scenario: Hacker Tries to Modify

```
BEFORE (Original):
  MongoDB: glucose = "285 mg/dL"
  Blockchain hash: 0xaabbccdd11...

ATTACK (Hacker modifies MongoDB):
  MongoDB: glucose = "85 mg/dL"  ← Fake lower value!
  Blockchain hash: 0xaabbccdd11... ← Still the same
  
DETECTION (Verification):
  computedHash = Keccak256("85...") = 0xXXXXXXXX (different!)
  blockchainHash = 0xaabbccdd11...
  
  ❌ MISMATCH DETECTED!
  Tampering proof: MongoDB ≠ Blockchain
```

---

## 4️⃣ Lý Do Thiết Kế

### 1. Privacy (Bảo Mật)

```
❌ WRONG:
  Blockchain stores: [GLUCOSE: 285, A1C: 9.2%, ...]
  Problem: Public blockchain = anyone can read
  → Vi phạm HIPAA/GDPR

✅ RIGHT:
  MongoDB stores: [GLUCOSE: 285, A1C: 9.2%, ...]
  Blockchain stores: hash_only
  → Private data in database
  → Only hash on public chain (anonymized)
```

### 2. Gas Efficiency (Chi Phí)

```
❌ WRONG (Store full data):
  Blockchain.post({
    tests: ["GLUCOSE", "A1C", "CBC"],
    clinicalNote: "Bệnh nhân có triệu chứng mệt mỏi...",
    diagnosisCode: "E11.9",
    ...
  })
  Gas cost: ~500,000 units
  Price: ~$50 - $200 per transaction

✅ RIGHT (Store hash only):
  Blockchain.post(orderHash)  ← 32 bytes
  Gas cost: ~50,000 units
  Price: ~$5 - $20 per transaction
  
  Savings: 10-20x cheaper!
```

### 3. Speed (Hiệu Suất)

```
❌ Blockchain bottleneck:
  - Transaction takes 10-30 seconds
  - Block confirmation takes 1-2 minutes
  - Not suitable for real-time clinical workflow
  
✅ Hybrid approach:
  - MongoDB query: milliseconds (immediate)
  - Blockchain hash: asynchronous (post-operation)
  - Doctor gets results instantly from DB
  - Blockchain catches up in background
```

### 4. Compliance (Quy Định)

```
Regulatory Requirements (HIPAA, GDPR, etc):
  ✅ Patient data must be:
     - Private by default
     - Encrypted at rest
     - Only accessible to authorized personnel
     - Auditable
  
✅ Hash-on-Chain solves:
  - Private: Data in MongoDB (encrypted DB)
  - Accessible: Fast MongoDB queries
  - Auditable: Immutable hashes on blockchain
  - Compliant: No PII on public blockchain
```

---

## 📊 Architecture Decision Matrix

| Aspect | Off-Chain (MongoDB) | On-Chain (Blockchain) | Reason |
|--------|------------------|-------------------|--------|
| **Patient Data** | ✅ Stored | ❌ No | Privacy, HIPAA |
| **Test Results** | ✅ Stored | ❌ No (hash only) | Sensitive values |
| **Clinical Notes** | ✅ Stored | ❌ No (hash only) | Too large, private |
| **Access Grants** | ✅ Stored | ✅ Stored | Dual audit trail |
| **Hashes** | ✅ Stored | ✅ Stored | Integrity proof |
| **Status/State** | ✅ Stored | ✅ Stored | Workflow tracking |
| **Performance** | ⚡ Fast | 🐢 Slow | Milliseconds vs seconds |
| **Cost** | 💰 Cheap | 💸 Expensive | No gas, vs gas fees |
| **Immutability** | ❌ Editable | ✅ Forever Fixed | Audit trail |
| **Encryption** | ✅ Possible | ❌ Public | Privacy enforcement |

---

## 🔍 Key Concept: Hash Verification

### What is a Hash?

```
Keccak256 is a cryptographic function that:
1. Takes ANY input (text, data, etc)
2. Produces a FIXED 32-byte output (64 hex characters)
3. Is DETERMINISTIC: same input = same output always
4. Is AVALANCHE: tiny input change = completely different output
5. Is ONE-WAY: can't reverse-engineer input from hash

Example:
  Input: "GLUCOSE: 285 mg/dL, A1C: 9.2%, WBC: 7.5 K/uL"
  Output: 0xaabbccdd11223344556677889900aabbccdd1122...
  
  Change 1 character:
  Input: "GLUCOSE: 85 mg/dL, A1C: 9.2%, WBC: 7.5 K/uL"  ← Only "2" removed!
  Output: 0xXXXXXXXXYYYYYYYYZZZZZZZZ...  ← Completely different!
```

### Why This Matters for EHR

```
Immutability Proof:
  If blockchain has hash H = Keccak256(original_data)
  Then later:
    - If data unchanged: new_hash = H ✅ Match
    - If data modified: new_hash ≠ H ❌ Mismatch
    
  Means: even 1 byte change will be detected!
  
Scientific Guarantee:
  Probability of hash collision (accident match): < 1 in 2^256
  = 1 in 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584,007,913,129,639,936
  
  → Practically impossible to fake or accidentally match
```

---

## 🎯 Summary: 3 Principles

### Principle 1: SEPARATION OF CONCERNS

```
MongoDB handles: "WHAT is the data?"
  ├─ Diagnosis text
  ├─ Test values  
  └─ Clinical notes

Blockchain handles: "CAN IT BE TRUSTED?"
  ├─ Is this data tampered?
  ├─ Who made this decision?
  └─ When was it made?
```

### Principle 2: LAYERED SECURITY

```
Layer 1: Access Control (Blockchain)
  └─ Only authorized doctors can read

Layer 2: Database Access Control (Backend)
  └─ JWT token must be valid
  └─ Role must be DOCTOR
  └─ Must have blockchain grant

Layer 3: Data Encryption (MongoDB)
  └─ Data encrypted at rest
  └─ Requires KMS key

Layer 4: Hash Verification (Hybrid)
  └─ Data integrity verified via blockchain hash
  └─ Detects any tampering
```

### Principle 3: AUDIT TRAIL

```
Every action is recorded twice:

✅ Off-Chain (Details):
  - Who created what record
  - What specific values were entered
  - When modifications occurred
  - Searchable, queryable

✅ On-Chain (Proof):
  - Hash of what was recorded
  - Immutable event logs
  - Patient wallet signed or approved
  - Tamper-proof, auditable forever
```

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| **PATIENT_CENTRIC_ACCESS_CONTROL_DETAILED.md** | Detailed flow: how doctor reads patient data (access control) |
| **LAB_ORDER_WORKFLOW_ON_CHAIN_VS_OFF_CHAIN.md** | Detailed flow: how lab orders created → results posted → interpreted |
| **DATA_STORAGE_STRATEGY.md** | Comprehensive guide: what data stored where and why |

---

## ✅ Conclusion

Your EHR system is designed with these principles:

```
┌────────────────────────────────────────────────────────────┐
│  BLOCKCHAIN (Immutable, Auditable, Public)                 │
│  ├─ Access control (who has permission)                    │
│  ├─ Workflow state (status transitions)                    │
│  └─ Integrity hashes (proof of data authenticity)          │
│                                                             │
│  MONGODB (Fast, Private, Mutable)                          │
│  ├─ Medical data (diagnosis, test results)                 │
│  ├─ Clinical notes (doctor observations)                   │
│  └─ Full audit trail (who did what when)                   │
│                                                             │
│  RESULT                                                     │
│  ✅ Patient privacy protected (HIPAA compliant)            │
│  ✅ Data integrity guaranteed (hash verification)          │
│  ✅ Clinical workflow optimized (fast lookups)             │
│  ✅ Audit trail immutable (blockchain records)             │
│  ✅ Cost efficient (minimal on-chain data)                 │
└────────────────────────────────────────────────────────────┘
```

This is the **Hash-on-Chain, Data-off-Chain** architecture — solving the core problem of having an immutable audit trail without exposing sensitive medical data.
