# 🔍 Code References: Where to Find Each Concept

**Purpose**: Navigate codebase to understand how LabOrder + TestResult actually works

---

## 📁 File Structure

```
src/
├── services/
│   ├── ehrWorkflow.service.js       ← Core logic (postLabResult, addClinicalInterpretation)
│   ├── labOrder.service.js          ← Lab order queries
│   └── medicalRecord.service.js     ← Medical record logic
│
├── models/
│   ├── labOrder.model.js            ← LabOrder schema
│   ├── medicalRecord.model.js       ← Medical record schema
│   ├── testResult.model.js          ← TestResult schema (friend's code)
│   ├── patient.model.js
│   ├── user.model.js
│   └── auditLog.model.js
│
├── controllers/
│   └── labOrder.controller.js       ← API endpoints
│
├── routes/v1/
│   └── labOrder.route.js            ← Route definitions
│
├── blockchain/
│   ├── contract.js                  ← Blockchain contracts
│   ├── provider.js
│   └── abis/
│       └── EHRManager.json
│
└── utils/
    └── ApiError.js
```

---

## 🔎 Finding Key Code Sections

### 1. Lab Tech Posts Result (Phase 1)

**File**: `src/services/ehrWorkflow.service.js`  
**Function**: `postLabResult`  
**Lines**: 234-360

**What Happens:**

```javascript
// Line 234: Function header
const postLabResult = async (currentUser, labOrderId, resultData) => {

// Line 241: EXTRACT rawData from request
const { rawData, note } = resultData;

// Line 245: FIND existing LabOrder (doctor created earlier)
const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);

// Line 253: SNAPSHOT wallet for audit trail
const labTechWalletSnapshot = normalizeWalletAddress(currentUser.walletAddress);

// Line 256-262: PREPARE metadata (includes rawData)
const labResultMetadata = {
    rawData,           // ← RAW DATA HERE
    note,
    labTech: normalizedLabTechWallet,
    postedAt: new Date().toISOString(),
};

// Line 271: HASH the rawData
const labResultString = JSON.stringify(labResultMetadata);
const labResultHash = ethers.keccak256(ethers.toUtf8Bytes(labResultString));
//    ↑ This is the blockchain proof

// Line 276-282: CALL blockchain
const tx = await blockchainContracts.labTech.ehrManager.postLabResult(
    recordId,
    labResultHash
);
const receipt = await tx.wait();
const txHash = receipt.hash;

// Line 321-325: SAVE to LabOrder (PRIMARY storage)
labOrder.sampleStatus = 'RESULT_POSTED';
labOrder.labResultData = rawData;           // ← STORED IN LabOrder
labOrder.labResultHash = labResultHash;
labOrder.labResultNote = note;
labOrder.labTechWalletAddress = labTechWalletSnapshot;  // Audit
labOrder.txHash = txHash;  // Blockchain proof

// Line 341: SAVE to MongoDB
await labOrder.save();
```

**Key Points:**

- `rawData` is stored in `LabOrder.labResultData` (line 321)
- Hash is created from `labResultMetadata` (line 271)
- Blockchain stores hash proof (line 276-282)
- LabOrder is THE primary storage

---

### 2. Doctor Views Result (Doctor Dashboard)

**File**: `src/controllers/labOrder.controller.js`  
**Function**: `getLabOrderDetail`  
**Lines**: 178-185

```javascript
const getLabOrderDetail = async (req, res, next) => {
    try {
        const result = await labOrderService.getLabOrderDetail(req.params.id, req.user);
        // Returns LabOrder with {
        //   _id: "lab-456",
        //   sampleStatus: "RESULT_POSTED",
        //   labResultData: { HbA1c: 5.8%, ... },  ← Doctor gets rawData here
        //   labResultHash: "0x1234...",
        //   labTechWalletAddress: "0xlab...",
        //   txHash: "0xabc...",
        //   ...
        // }
        res.json(result);
    } catch (error) {
        next(error);
    }
};
```

**Route**: `src/routes/v1/labOrder.route.js:447`

```javascript
Router.get('/:id', verifyToken, labOrderController.getLabOrderDetail);
```

**Frontend Usage:**

```javascript
// Doctor calls: GET /v1/lab-orders/:id
// Frontend shows doctor the labResultData from response
// Doctor reviews and formulates interpretation
```

---

### 3. Doctor Creates Interpretation (Phase 2)

**File**: `src/services/ehrWorkflow.service.js`  
**Function**: `addClinicalInterpretation`  
**Lines**: 365-650

**Key Code Sections:**

**Line 365-380: Verify doctor role**

```javascript
const addClinicalInterpretation = async (currentUser, labOrderId, interpretationData) => {
    await verifyRole(currentUser, 'DOCTOR');
    const { interpretation, recommendation, confirmedDiagnosis, interpreterNote } = interpretationData;
    // ✅ confirmedDiagnosis is REQUIRED - doctor must explicitly confirm
```

**Line 395-405: Fetch LabOrder (same entity from Phase 1)**

```javascript
const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
if (!labOrder) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
}

// CRITICAL: Check status must be RESULT_POSTED (after lab tech posted result)
if (labOrder.sampleStatus !== 'RESULT_POSTED') {
    throw new ApiError(...);
}
```

**Line 410-430: Hash interpretation**

```javascript
const interpretationMetadata = {
    interpretation,
    recommendation,
    confirmedDiagnosis,
    doctor: normalizedDoctorAddress,
    interpretedAt: new Date().toISOString(),
};

const interpretationHash = ethers.keccak256(
    ethers.toUtf8Bytes(interpretation + (recommendation || ''))
);
```

**Line 480-500: Call blockchain**

```javascript
const tx = await blockchainContracts.doctor.ehrManager.addClinicalInterpretation(
    recordId,
    interpretationHash
);
const receipt = await tx.wait();
const txHash = receipt.hash;
```

**Line 570-590: Update SAME LabOrder (not TestResult!)**

```javascript
labOrder.sampleStatus = 'DOCTOR_REVIEWED';
labOrder.clinicalInterpretation = interpretation;
labOrder.recommendation = recommendation;
labOrder.interpreterNote = interpreterNote;
labOrder.interpretationHash = interpretationHash;
labOrder.doctorWalletAddress = normalizedDoctorAddress;
labOrder.txHash = txHash;
labOrder.auditLogs.push({
    from: 'RESULT_POSTED',
    to: 'DOCTOR_REVIEWED',
    by: normalizedDoctorAddress,
    at: now,
    txHash,
});
await labOrder.save();  // ← SAVE to LabOrder
```

**Key Points:**

- Doctor adds interpretation fields to **SAME LabOrder** (not creating new TestResult)
- LabOrder.labResultData remains unchanged (still accessible to doctor)
- Doctor did NOT create TestResult at this step

---

### 4. LabOrder Model (Schema Definition)

**File**: `src/models/labOrder.model.js`  
**Lines**: 1-130

**Field Definitions:**

**Lines 50-75: Data fields**

```javascript
labResultData: Object,              // ← rawData stored here
labResultNote: String,
clinicalInterpretation: String,
recommendation: String,
confirmedDiagnosis: String,
```

**Lines 53-67: Blockchain proof fields**

```javascript
orderHash: String,                  // ← Hash from doctor's order creation
labResultHash: String,              // ← Hash of rawData (from lab tech)
interpretationHash: String,         // ← Hash of doctor's interpretation
txHash: {
    type: String,
    description: 'Blockchain transaction hash (msg.sender embedded)',
},
```

**Lines 69-79: Wallet snapshots (audit trail)**

```javascript
labTechWalletAddress: {
    type: String,
    index: true,
    description: 'Snapshot at post-result time',
},
doctorWalletAddress: {
    type: String,
    index: true,
    description: 'Snapshot at interpretation time',
},
```

**Lines 40-49: State machine**

```javascript
sampleStatus: {
    type: String,
    enum: Object.values(SAMPLE_STATUS),
    default: SAMPLE_STATUS.ORDERED,
},
```

**States:**

```javascript
const SAMPLE_STATUS = {
    ORDERED: 'ORDERED',          // Doctor creates
    CONSENTED: 'CONSENTED',      // Patient approves
    IN_PROGRESS: 'IN_PROGRESS',  // Lab tech collecting
    RESULT_POSTED: 'RESULT_POSTED',      // Lab tech POST → rawData arrives
    DOCTOR_REVIEWED: 'DOCTOR_REVIEWED',  // Doctor adds interpretation
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED',
};
```

---

### 5. TestResult Model (Friend's Code)

**File**: `src/models/testResult.model.js`  
**Purpose**: Friend's enhancement (needs review)

**Current Issue**: Need to verify if TestResult contains `rawData` copy

**Check**:

```javascript
// Search for: testResult.model.js
// Look for: rawData field
// If exists: ⚠️ Data duplication (should reference LabOrder.labResultData instead)
```

---

### 6. Blockchain Calls

**File**: `src/blockchain/contract.js`  
**Purpose**: Deployed smart contract instances

**Key Contracts Used:**

```javascript
blockchainContracts.labTech.ehrManager.postLabResult(recordId, labResultHash)
blockchainContracts.doctor.ehrManager.addClinicalInterpretation(recordId, interpretationHash)
blockchainContracts.read.accessControl.checkAccessLevel(patient, doctor, level)
blockchainContracts.read.accountManager.isDoctor(address)
```

**ABI**: `src/blockchain/abis/EHRManager.json`

---

### 7. Audit Trail

**File**: `src/models/auditLog.model.js`  
**File**: `src/models/labOrder.model.js` (lines 100-110, `auditLogs` array)

**LabOrder.auditLogs example:**

```javascript
labOrder.auditLogs = [
  {
    from: 'IN_PROGRESS',
    to: 'RESULT_POSTED',
    by: '0xlab...',
    at: timestamp,
    txHash: '0xabc...',
  },
  {
    from: 'RESULT_POSTED',
    to: 'DOCTOR_REVIEWED',
    by: '0xdoc...',
    at: timestamp,
    txHash: '0xdef...',
  },
]
```

---

### 8. Medical Record Integration

**File**: `src/models/medicalRecord.model.js`  
**Lines**: 1-150

**Links to LabOrder:**

```javascript
testResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'test_results',
},

relatedLabOrderId: {
    // Doctor creates MedicalRecord, then creates LabOrder
    // LabOrder stores reference back to MedicalRecord
}
```

**Diagnosis Sync (Line 500+):**

```javascript
// When doctor confirms diagnosis:
// 1. Save confirmedDiagnosis to LabOrder
// 2. Sync to related MedicalRecord (if exists)
// 3. Update MedicalRecord.diagnosisHistory
```

---

## 🔄 Complete Data Flow

```
STEP 1: Doctor Creates Lab Order
  ├─ API: POST /v1/lab-orders
  ├─ Controller: src/controllers/labOrder.controller.js:createLabOrder
  ├─ Service: src/services/labOrder.service.js:createLabOrder
  ├─ Blockchain Call: EHRManager.addRecord(patient, recordType, requiredLevel, orderHash)
  └─ DB: Create LabOrder { sampleStatus: 'ORDERED' }

STEP 2: Lab Tech Posts Result
  ├─ API: POST /v1/lab-orders/:id/post-result
  ├─ Controller: src/controllers/labOrder.controller.js:postLabResult
  ├─ Service: src/services/ehrWorkflow.service.js:postLabResult (LINE 234)
  ├─ Extract: rawData, note
  ├─ Hash: labResultHash = keccak256(rawData)
  ├─ Blockchain Call: EHRManager.postLabResult(recordId, labResultHash)
  ├─ DB: Update LabOrder {
  │     labResultData: rawData,        ← RAW DATA STORED HERE
  │     labResultHash: hash,
  │     sampleStatus: 'RESULT_POSTED',
  │     labTechWalletAddress: "0xlab...",
  │     txHash: "0xabc..."
  │   }
  └─ Create AuditLog

STEP 3: Doctor Views & Researches
  ├─ API: GET /v1/lab-orders/:id
  ├─ Controller: src/controllers/labOrder.controller.js:getLabOrderDetail
  ├─ Service: src/services/labOrder.service.js:getLabOrderDetail
  ├─ DB: Fetch LabOrder { labResultData: {...}, labResultHash: "0x..." }
  └─ Frontend: Show doctor the rawData + blockchain proof

STEP 4: Doctor Creates Interpretation
  ├─ API: POST /v1/lab-orders/:id/interpretation
  ├─ Controller: src/controllers/labOrder.controller.js:addClinicalInterpretation
  ├─ Service: src/services/ehrWorkflow.service.js:addClinicalInterpretation (LINE 365)
  ├─ Verify: LabOrder.sampleStatus == 'RESULT_POSTED' (raw data already posted)
  ├─ Hash: interpretationHash = keccak256(interpretation + recommendation)
  ├─ Blockchain Call: EHRManager.addClinicalInterpretation(recordId, interpretationHash)
  ├─ DB: Update SAME LabOrder {
  │     clinicalInterpretation: interpretation,  ← ADDED TO SAME ENTITY
  │     interpretationHash: hash,
  │     doctorWalletAddress: "0xdoc...",
  │     sampleStatus: 'DOCTOR_REVIEWED',
  │     txHash: "0xdef...",
  │     auditLogs: [..., {event: DOCTOR_REVIEWED, txHash: "0xdef..."}]
  │   }
  └─ Sync: Optional - update MedicalRecord.confirmedDiagnosis

STEP 5: Optional - AI Analysis (TestResult)
  ├─ Trigger: Backend AI system or manual analysis
  ├─ Create: TestResult {
  │     labOrderId: "lab-456",         ← Reference back
  │     testType: "DIABETES",
  │     aiAnalysis: { riskScore: 0.85, ... },  ← AI SUGGESTIONS ONLY
  │     // NOT rawData - that stays in LabOrder!
  │   }
  └─ Purpose: Enhance doctor's decision (optional AI layer)
```

---

## 🔍 Query Examples

### Find All Results Ready for Doctor Review

```javascript
// Current (CORRECT): Simple, fast
LabOrder.find({ 
    sampleStatus: 'RESULT_POSTED',
    labTechWalletAddress: { $exists: true }
})
.sort({ createdAt: -1 })
.limit(10)

// If TestResult had rawData (WRONG): Complex, slow
LabOrder.find({ 
    sampleStatus: 'RESULT_POSTED' 
})
.populate('testResultId')  ← Join needed
.sort({ createdAt: -1 })
.limit(10)
.then(orders => 
    orders.filter(order => 
        order.testResultId && 
        order.testResultId.rawData !== undefined  ← App-level filtering
    )
)
```

### Find All Interpreted Results

```javascript
LabOrder.find({
    sampleStatus: 'DOCTOR_REVIEWED',
    clinicalInterpretation: { $exists: true }
})
.populate('relatedMedicalRecordId')
```

### Verify Blockchain Proof

```javascript
// Step 1: Get hash from blockchain
const blockchainHash = await ehrManager.recordHashes(recordId);

// Step 2: Get data from MongoDB
const labOrder = await LabOrder.findById(labOrderId);

// Step 3: Recalculate hash
const calculatedHash = keccak256(
    JSON.stringify(labOrder.labResultData)
);

// Step 4: Verify
if (calculatedHash === blockchainHash) {
    console.log("✅ Proof verified!");
} else {
    console.log("❌ Proof broken!");
}
```

---

## 📚 How to Navigate

### For Understanding Post-Result Flow

1. Start: `src/services/ehrWorkflow.service.js:234` (postLabResult function)
2. Read: How rawData is stored in LabOrder (line 321)
3. Check: `src/models/labOrder.model.js` (schema definition)
4. Verify: `src/blockchain/abis/EHRManager.json` (blockchain contract)

### For Understanding Interpretation Flow

1. Start: `src/services/ehrWorkflow.service.js:365` (addClinicalInterpretation)
2. See: How doctor reads existing LabOrder
3. Observe: Doctor adds fields to SAME LabOrder (not create TestResult)

### For Understanding Query Performance

1. Check: `src/controllers/labOrder.controller.js` (dashboard queries)
2. Compare: Current queries vs hypothetical multi-entity queries
3. Learn: N+1 query problem

### For Blockchain Verification

1. Look: `src/blockchain/abis/EHRManager.json` (smart contract interface)
2. Understand: What data blockchain stores vs MongoDB stores
3. Reason: Why hash proof must match MongoDB data

---

## ⚠️ To Do: Verify Friend's TestResult Implementation

**Action Items:**

1. Check if `src/models/testResult.model.js` contains `rawData` field
2. If YES: ⚠️ Data duplication (security risk)
3. Action: Remove `rawData` from TestResult, add reference to LabOrder
4. Keep: Only `aiAnalysis` and metadata in TestResult
5. Test: Ensure LabOrder.labResultHash still verifies correctly

---

## 🎯 Summary

| Component | File | Purpose | Contains rawData? |
|-----------|------|---------|------------------|
| LabOrder | `labOrder.model.js` | Main entity | ✅ YES (line 321) |
| TestResult | `testResult.model.js` | AI analysis layer | ❌ NO (should not have) |
| MedicalRecord | `medicalRecord.model.js` | Clinical context | ❌ No (references LabOrder) |
| Blockchain | `EHRManager.abi` | Proof chain | Hash only (not data) |
| AuditLog | `auditLog.model.js` | Change history | Metadata only |
