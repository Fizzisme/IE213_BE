# 🔒 Data Storage Strategy: On-Chain vs Off-Chain

**Mục đích:** Giải thích rõ ràng dữ liệu nào được lưu trên blockchain, dữ liệu nào lưu trên MongoDB và TẠI SAO

---

## ⚠️ NGUYÊN TẮC CHÍNH

```
BLOCKCHAIN (Ethereum) - ❌ KO lưu dữ liệu y tế nhạy cảm
  ├─ Tính chất: Public, immutable, ĐỌNG DATA VĨ VẠNG
  ├─ Chi phí: MỖI BYTE DỮ LIỆU = TIỀN GAS
  └─ ❌ Ko lưu: Yêu cầu xét nghiệm, kết quả xét nghiệm, chẩn đoán chi tiết

MONGODB (Off-Chain) - ✅ LƯU HẾT dữ liệu y tế
  ├─ Tính chất: Private, có thể sửa/xóa, nhanh
  ├─ Chi phí: Rẻ, ko tính gas
  └─ ✅ Lưu: All clinical data, test results, diagnoses
```

---

## 📊 BẢNG SO SÁNH CHI TIẾT

| Dữ Liệu | MongoDB | Blockchain | Giải Thích |
|---------|---------|------------|-----------|
| **Access Grants** | ❌ | ✅ | Ai có quyền xem gì (immutable + audit trail) |
| **Revoked Access** | ❌ | ✅ | Khi patient hủy grant (event log) |
| **Diagnosis Interpretation Hash** | ✅ | ✅ | Hash Keccak256 để verify không bị modify |
| **Yêu cầu xét nghiệm chi tiết** | ✅ | ❌ | Ko cần on-chain, doctor orders locally |
| **Kết quả xét nghiệm** | ✅ | ❌ | Ko cần on-chain, lab tech posts locally |
| **Diagnosis text** | ✅ | ❌ | Ko cần on-chain, doctor ghi chú tại chỗ |
| **Medical history** | ✅ | ❌ | Ko cần on-chain, dữ liệu quá lớn |

---

## 🏗️ MULTI-LAYER ARCHITECTURE

### Layer 1: Access Control (On-Chain)

```solidity
// AccessControl.sol

contract AccessControl {
    mapping(address patient => 
        mapping(address doctor => 
            Grant)) grants;
    
    event AccessGranted(address patient, address doctor, ...) 
    event AccessRevoked(address patient, address doctor, ...)
}

// ✅ WHAT'S STORED:
// - patient address
// - doctor address  
// - access level (BASIC=1, FULL=2)
// - grantedAt timestamp
// - expiresAt timestamp
// - isActive boolean

// ❌ NOT STORED:
// - Doctor's interpretation of patient data
// - Test results details
// - Diagnosis text
// - Patient's medical history
```

**Tại sao on-chain?**

- Immutable audit trail
- Patient can't deny they granted
- Doctor can't deny they revoked
- Blockchain ensures no tampering

---

### Layer 2: Clinical Data (Off-Chain, MongoDB)

```javascript
// MongoDB Collections

// ✅ STORED OFF-CHAIN
db.medicalRecords {
    _id: ObjectId,
    patientId: ObjectId,
    type: "DIABETES_TEST",
    diagnosis: "Tiểu đường type 2",  // ← DETAILED diagnosis
    clinicalInterpretation: "Bệnh nhân ...",  // ← FULL clinical notes
    recommendation: "Tăng luyện tập, ...",
    interpretationHash: "0x1234..."  // ← HASH stored (verify blockchain)
}

db.testResults {
    _id: ObjectId,
    patientId: ObjectId,
    medicalRecordId: ObjectId,
    testType: "GLUCOSE",
    rawData: {  // ← FULL test data
        glucose: "180 mg/dL",
        timestamp: "2026-04-09 10:30:00",
        unit: "mg/dL",
        referenceRange: "70-100",
        status: "HIGH"
    },
    createdBy: ObjectId  // Lab tech
}

db.labOrders {
    _id: ObjectId,
    patientId: ObjectId,
    doctorId: ObjectId,
    tests: [  // ← FULL list of requested tests
        {
            type: "GLUCOSE",
            priority: "HIGH",
            notes: "Xét nghiệm để chẩn đoán tiểu đường"
        }
    ],
    orderDate: "2026-04-09 09:00:00",
    status: "PENDING"
}
```

**Tại sao off-chain?**

- Bảo mật: Ko công khai trên blockchain
- Chi phí: Blockchain data = tiền gas
- Linh hoạt: Có thể update/correct dữ liệu
- Hiệu suất: MongoDB nhanh, blockchain chậm

---

### Layer 3: Integrity Check (Hash on Blockchain)

```javascript
// Workflow: Doctor interprets lab results

// Step 1: Doctor thêm interpretation vào medical record (OFF-CHAIN)
await ehRManager.addClinicalInterpretation(
    medicalRecordId,
    interpretationText,      // ← OFF-CHAIN (full text in MongoDB)
    testResultsHash          // ← ON-CHAIN (hash only)
)

// Step 2: Contract stores ONLY HASH
contract EHRManager {
    mapping(uint256 recordId => bytes32) interpretationHash;
    
    function addClinicalInterpretation(
        uint256 _recordId,
        bytes32 _hash
    ) external {
        // ✅ STORED: _recordId + _hash
        interpretationHash[_recordId] = _hash;
        
        // ❌ NOT STORED: Full interpretation text
        // (Text stays in MongoDB)
    }
    
    event InterpretationAdded(uint256 recordId, bytes32 hash);
}

// Step 3: Verification
const verifyInterpretation = async (medicalRecordId) => {
    // Lấy text từ MongoDB
    const record = await medicalRecordModel.findById(medicalRecordId);
    const offChainText = record.clinicalInterpretation;
    
    // Compute hash
    const computedHash = ethers.keccak256(
        ethers.solidityPacked(['string'], [offChainText])
    );
    
    // Lấy hash từ blockchain
    const blockchainHash = await ehRManager.interpretationHash(medicalRecordId);
    
    // Compare
    if (computedHash !== blockchainHash) {
        throw new Error("⚠️ Data tampering detected!");
    }
}
```

**Flow:**

```
Doctor adds interpretation
↓
[MongoDB] Save: Full text + compute hash
↓
[Blockchain] Save: Only hash
↓
Later - Verify integrity:
  1. Get text from MongoDB
  2. Compute hash
  3. Compare with blockchain hash
  4. If match → ✅ Not tampered
  5. If no match → ❌ WARNING
```

---

## 📋 CONCRETE EXAMPLE: Full Lab Workflow

### 🏥 Hospital: Doctor Minh Orders Lab Test

#### Request Data

```http
POST /v1/doctors/lab-orders HTTP/1.1
Content-Type: application/json

{
    "patientId": "507f1f77bcf86cd799439011",
    "tests": [
        {
            "type": "GLUCOSE",
            "priority": "HIGH",
            "notes": "Xét nghiệm để chẩn đoán tiểu đường"
        },
        {
            "type": "A1C",
            "priority": "HIGH",
            "notes": "Kiểm tra mức độ kiểm soát đường huyết"
        }
    ]
}
```

#### MongoDB Storage

```javascript
// labOrder document
db.labOrders.insertOne({
    _id: ObjectId("lab_001"),
    patientId: ObjectId("507f...11"),
    doctorId: ObjectId("507f...aaa1"),  // Doctor Minh
    tests: [
        { type: "GLUCOSE", priority: "HIGH", notes: "..." },
        { type: "A1C", priority: "HIGH", notes: "..." }
    ],
    status: "PENDING",
    orderDate: ISODate("2026-04-09T09:00:00Z")
})

🔑 KEY: ✅ FULL details stored locally (not on blockchain)
```

#### Blockchain Storage

```
❌ NOTHING STORED YET
(Blockchain doesn't care about lab orders)
```

---

### 🔬 Lab: Lab Tech Posts Results

#### Request Data

```http
POST /v1/lab-techs/test-results HTTP/1.1
Content-Type: application/json

{
    "medicalRecordId": "507f...999",
    "testType": "GLUCOSE",
    "rawData": {
        "glucose": "250 mg/dL",
        "timestamp": "2026-04-09T10:30:00Z",
        "unit": "mg/dL",
        "referenceRange": "70-100",
        "status": "CRITICAL_HIGH"
    }
}
```

#### MongoDB Storage

```javascript
// testResult document
db.testResults.insertOne({
    _id: ObjectId("test_001"),
    patientId: ObjectId("507f...11"),
    medicalRecordId: ObjectId("507f...999"),
    createdBy: ObjectId("lab_tech_001"),
    testType: "GLUCOSE",
    rawData: {  // ✅ FULL data stored
        glucose: "250 mg/dL",
        timestamp: "2026-04-09T10:30:00Z",
        unit: "mg/dL",
        referenceRange: "70-100",
        status: "CRITICAL_HIGH"
    },
    createdAt: ISODate("2026-04-09T10:30:00Z")
})

// Update medical record status
db.medicalRecords.updateOne(
    { _id: ObjectId("507f...999") },
    { $set: { status: "HAS_RESULT" } }
)

🔑 KEY: ✅ FULL lab results stored locally (NOT on blockchain)
```

#### Blockchain Storage

```
❌ NOTHING STORED
(Test results stay in MongoDB)
```

---

### 👨‍⚕️ Doctor: Interprets Lab Results (With Blockchain)

#### Request Data

```http
POST /v1/doctors/lab-orders/507f.../clinical-interpretation HTTP/1.1
Content-Type: application/json

{
    "clinicalInterpretation": "Bệnh nhân có nồng độ glucose 250 mg/dL, cao hơn mức bình thường (70-100). Kết hợp với A1C 9.2%, chẩn đoán là tiểu đường type 2. Khuyến cáo: điều chỉnh chế độ ăn, tăng hoạt động thể chất, có thể cần thuốc."
}
```

#### MongoDB Storage (Step 1)

```javascript
const fullInterpretation = "Bệnh nhân có nồng độ glucose ... (full text)";

// Store in medical record
db.medicalRecords.updateOne(
    { _id: ObjectId("507f...999") },
    {
        $set: {
            clinicalInterpretation: fullInterpretation,  // ✅ Full text
            interpretationHash: "0x1234...",             // Hash for verification
            status: "DIAGNOSED"
        }
    }
)

🔑 KEY: ✅ FULL interpretation text stored locally
```

#### Blockchain Storage (Step 2)

```solidity
// Doctor calls this function
ehRManager.addClinicalInterpretation(
    medicalRecordId: "507f...999",
    interpretationHash: "0x1234..."  // ← HASH ONLY, not full text
)

// What's stored in blockchain:
mapping[medicalRecordId => interpretationHash]
mapping["507f...999" => "0x1234..."]

🔑 KEY: ❌ NO full interpretation text stored
🔑 KEY: ✅ ONLY hash stored (for integrity verification)
```

---

## 🔍 VERIFICATION LATER

### Check if Someone Tampered with Interpretation

```javascript
const verifyInterpretation = async (medicalRecordId) => {
    // Step 1: Get off-chain data from MongoDB
    const record = await medicalRecordModel.findById("507f...999");
    const currentText = record.clinicalInterpretation;
    
    /*
    currentText = "Bệnh nhân có nồng độ glucose ... (full text)"
    */
    
    // Step 2: Compute hash
    const computedHash = ethers.keccak256(
        ethers.solidityPacked(['string'], [currentText])
    );
    /*
    computedHash = "0x1234..."
    */
    
    // Step 3: Get blockchain hash
    const blockchainHash = await ehRManager.interpretationHash("507f...999");
    /*
    blockchainHash = "0x1234..."
    */
    
    // Step 4: Compare
    if (computedHash === blockchainHash) {
        console.log("✅ Interpretation is AUTHENTIC (not tampered)");
    } else {
        console.warn("❌ WARNING: Interpretation has been modified!");
        console.warn(`Expected hash: ${blockchainHash}`);
        console.warn(`Actual hash: ${computedHash}`);
    }
};

// Run verification
await verifyInterpretation("507f...999");
// Output: ✅ Interpretation is AUTHENTIC (not tampered)
```

---

## 🚨 SCENARIO: What IF Someone Tries to Modify Data?

### Scenario: Lab tech changes test result

```javascript
// BEFORE (Original)
db.testResults {
    glucose: "250 mg/dL"
}

// Attacker tries to change:
db.testResults {
    glucose: "75 mg/dL"  // ← MODIFIED (lower, hiding critical result!)
}

// Result:
// ❌ MongoDB data changed (no protection)
// ✅ But blockchain hash remains unchanged
//    So if you verify → hash mismatch → DETECTED!
```

**Detection:**

```javascript
// Upon verification:
const currentText = "...75 mg/dL...";
const computedHash = keccak256(currentText);  // = "0x5678..."
const blockchainHash = "0x1234...";           // Original

// ❌ Mismatch! Data was modified!
console.warn("Data tampering detected!");
```

**BUT PROBLEM**: This only detects tampering of **interpretation**, not test results themselves!

---

## 🔐 SECURITY LAYERS

### Layer 1: Access Control (Blockchain)

```
✅ Patient can SEE who accessed their data
✅ Doctor must have blockchain grant to read
✅ Revoke is immutable + auditable
```

### Layer 2: MongoDB Access Control

```
✅ Role-based access (DOCTOR, LAB_TECH, PATIENT)
✅ checkAccessGrant middleware verifies blockchain grant
✅ MongoDB query filters by patientId (patient-centric)
```

### Layer 3: Data Integrity (Blockchain Hash)

```
✅ Interpretation stored OFF-CHAIN (full text)
✅ Hash stored ON-CHAIN
✅ Later can verify: hash(current_text) == blockchain_hash
✅ Detects if someone modified interpretation
```

### Layer 4: Audit Trail

```
✅ Blockchain events log: AccessGranted, AccessRevoked, InterpretationAdded
✅ MongoDB auditLog: Who created/updated what
✅ Tamper-proof because blockchain is immutable
```

---

## 📝 WHAT SHOULD GO ON-CHAIN vs OFF-CHAIN

### ✅ MUST be ON-CHAIN (Immutable Audit)

- Access grants (who has permission)
- Access revocations (when permission removed)
- Hash of interpretations (for integrity check)
- Timestamp of professional decisions
- Event logs (who did what, when)

### ✅ MUST be OFF-CHAIN (Performance + Privacy)

- Detailed diagnosis text
- Test result values
- Lab order details
- Patient demographics
- Medical history
- Doctor notes
- Any large medical data

---

## 🎯 KEY TAKEAWAY

```
❌ WRONG: Store test results + diagnosis on blockchain
✅ RIGHT: Store ONLY access rights + integrity hashes on blockchain

❌ WRONG: Patient data visible to everyone on blockchain
✅ RIGHT: Patient data private in MongoDB, access controlled by blockchain

❌ WRONG: Doctor's interpretation stored on blockchain
✅ RIGHT: Doctor's interpretation in MongoDB, hash in blockchain for verification
```

---

## ✅ CURRENT IMPLEMENTATION STATUS

| Feature | Status | Details |
|---------|--------|---------|
| Access grants on-chain | ✅ DONE | AccessControl.sol + AccessGranted events |
| Test results off-chain | ✅ DONE | testResult.service.js stores in MongoDB |
| Diagnosis off-chain | ✅ DONE | medicalRecord.service.js stores in MongoDB |
| Lab orders off-chain | ✅ DONE | labOrder.service.js stores in MongoDB |
| Interpretation hash on-chain | ✅ DONE | EHRManager.addClinicalInterpretation() |
| Verification logic | ✅ DONE | medicalRecord.getDetailWithHashVerification() |
| Audit trail | ✅ DONE | auditLog + blockchain events |

✅ **KẾT LUẬN:** Hệ thống đã đúng! KHÔNG có dữ liệu nhạy cảm được đẩy on-chain.
