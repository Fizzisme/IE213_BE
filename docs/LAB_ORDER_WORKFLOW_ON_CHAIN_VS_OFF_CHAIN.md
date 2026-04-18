# 📋 Lab Order Workflow: On-Chain vs Off-Chain Chi Tiết

**Mục đích:** Giải thích cụ thể cái gì được gửi lên blockchain (on-chain) vs lưu off-chain, từ khi doctor order xét nghiệm đến khi có kết quả.

---

## 🎯 Nguyên Tắc Chính

```
┌─────────────────────────────────────────────────────────────┐
│  Doctor creates Lab Order                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ❌ ON-CHAIN: KHÔNG gửi toàn bộ dữ liệu lab order             │
│                                                              │
│ ✅ ON-CHAIN: CHỈ gửi HASH                                   │
│    └─> orderHash = Keccak256(metadata)                      │
│                                                              │
│ ✅ OFF-CHAIN (MongoDB): Lưu TẤT CẢ dữ liệu chi tiết        │
│    ├─> Các test cần làm (CBC, CRP, glucose, ...)           │
│    ├─> Ghi chú lâm sàng                                     │
│    ├─> ICD-10 diagnosis code                                │
│    ├─> Loại mẫu (blood, urine, ...)                         │
│    └─> Priority (normal, urgent)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📥 STEP 1: Doctor Tạo Lab Order

### 🖥️ Request được gửi

```http
POST /v1/lab-orders HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
    "patientAddress": "0xPATIENT111222333444555666",
    "patientId": "507f1f77bcf86cd799439011",
    "recordType": "DIABETES_TEST",
    "testsRequested": [
        {
            "code": "GLUCOSE",
            "name": "Xét nghiệm glucose lúc đói",
            "group": "biochemistry",
            "urgent": false,
            "note": "Lấy mẫu lúc đói"
        },
        {
            "code": "A1C",
            "name": "Hemoglobin A1C",
            "group": "biochemistry",
            "urgent": false,
            "note": "Kiểm tra mức độ kiểm soát đường huyết 3 tháng"
        },
        {
            "code": "CBC",
            "name": "Công thức máu toàn phần",
            "group": "hematology",
            "urgent": false,
            "note": "Kiểm tra dữ liệu máu cơ bản"
        }
    ],
    "priority": "normal",
    "clinicalNote": "Bệnh nhân có triệu chứng mệt mỏi, khô miệng. Nghi ngờ tiểu đường type 2. Cần xét nghiệm để xác nhận chẩn đoán.",
    "sampleType": "blood",
    "diagnosisCode": "E11.9",
    "attachments": [
        "ipfs://QmvyD6T3Foa..."  // Optional: patient medical history PDF
    ]
}
```

---

### 🗂️ OFF-CHAIN Storage (MongoDB)

```javascript
// Collection: labOrders

db.labOrders.insertOne({
    _id: ObjectId("lab_order_001"),
    
    // ✅ Patient reference
    patientId: ObjectId("507f1f77bcf86cd799439011"),
    patientAddress: "0xPATIENT111222333444555666",
    
    // ✅ Doctor reference
    doctorId: ObjectId("507f1f77bcf86cd79943aaa1"),
    doctorAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
    
    // ✅ Record metadata
    recordType: "DIABETES_TEST",
    status: "ORDERED",
    
    // ✅ FULL test details stored locally
    testsRequested: [
        {
            code: "GLUCOSE",
            name: "Xét nghiệm glucose lúc đói",
            group: "biochemistry",
            urgent: false,
            note: "Lấy mẫu lúc đói"
        },
        {
            code: "A1C",
            name: "Hemoglobin A1C",
            group: "biochemistry",
            urgent: false,
            note: "Kiểm tra mức độ kiểm soát đường huyết 3 tháng"
        },
        {
            code: "CBC",
            name: "Công thức máu toàn phần",
            group: "hematology",
            urgent: false,
            note: "Kiểm tra dữ liệu máu cơ bản"
        }
    ],
    
    // ✅ Full clinical context
    priority: "normal",
    clinicalNote: "Bệnh nhân có triệu chứng mệt mỏi, khô miệng...",
    sampleType: "blood",
    diagnosisCode: "E11.9",
    
    // ✅ IPFS attachments
    attachments: [
        "ipfs://QmvyD6T3Foa..."
    ],
    
    // ✅ Audit trail
    createdAt: ISODate("2026-04-09T10:00:00Z"),
    updatedAt: ISODate("2026-04-09T10:00:00Z")
})

// 🔑 KEY: Tất cả dữ liệu nhạy cảm và chi tiết lưu tại đây (OFF-CHAIN)
```

---

### ⛓️ ON-CHAIN Storage (Blockchain)

**Step 1: Compute Hash**

```javascript
// Backend service computes
const orderMetadata = {
    recordType: "DIABETES_TEST",
    testsRequested: [  // ← Toàn bộ danh sách test
        { code: "GLUCOSE", name: "...", group: "..." },
        { code: "A1C", name: "...", group: "..." },
        { code: "CBC", name: "...", group: "..." }
    ],
    priority: "normal",
    clinicalNote: "Bệnh nhân có triệu chứng...",
    sampleType: "blood",
    diagnosisCode: "E11.9",
    createdBy: "0xDOCTOR_MINH_AABBCCDDEEFF",
    timestamp: 1712686800
};

// Compute Keccak256
const orderHash = keccak256(JSON.stringify(orderMetadata));
// orderHash = "0x1a2b3c4d5e6f7g8h9i0j..."
```

**Step 2: Send Transaction**

```solidity
// Backend calls smart contract
function addRecord(
    address patient,                       // 0xPATIENT111...
    RecordType recordType,                 // DIABETES_TEST
    AccessLevel requiredLevel,             // FULL
    bytes32 orderHash                      // 0x1a2b3c4d5e... ← CHỈ HASH!
) external returns (uint256) {
    // Store on-chain
    records[1] = Record({
        id: 1,
        patient: 0xPATIENT111...,
        author: 0xDOCTOR_MINH...,
        recordType: DIABETES_TEST,
        status: ORDERED,
        orderHash: 0x1a2b3c4d5e...,        // ← CHỈ HASH được lưu
        labResultHash: bytes32(0),
        interpretationHash: bytes32(0),
        requiredLevel: FULL,
        createdAt: 1712686800,
        updatedAt: 1712686800,
        active: true
    });
    
    // Return record ID
    return 1;
}
```

**Blockchain State After**

```solidity
// On-chain, chỉ lưu trữ này:
records[1] = {
    id: 1,
    patient: 0xPATIENT111222333444555666,
    author: 0xDOCTOR_MINH_AABBCCDDEEFF,
    recordType: DIABETES_TEST,
    status: ORDERED,
    orderHash: 0x1a2b3c4d5e6f7g8h9i0j...,  // ← HASH ONLY
    labResultHash: bytes32(0),
    interpretationHash: bytes32(0),l.......ii
    requiredLevel: FULL,
    createdAt: 1712686800,
    active: true
}

// ❌ NOT STORED on-chain:
// - testsRequested array
// - priority string
// - clinicalNote text
// - sampleType
// - diagnosisCode
// - attachments
// - Any patient data
```

**Timeline**

```
10:00:00 Doctor POSTs /lab-orders
    ↓
10:00:01 Backend computes orderHash (Keccak256)
    ↓
10:00:02 Backend stores full data in MongoDB
    ↓
10:00:03 Backend calls blockchain addRecord(hash_only)
    ↓
10:00:05 Blockchain stores Hash + metadata (record ID, status)
    ↓
✅ Response to doctor with recordId "1"
```

---

## 🔓 STEP 2: Patient Gives Consent (CRITICAL - Patient-Centric)

### ❓ Tại Sao Bước Này Cần Thiết?

```
PROBLEM: Lab Order đã được tạo, nhưng người bệnh chưa biết, chưa đồng ý!

PRINCIPLE: Patient-Centric Design
  ├─ Bệnh nhân quyền quyết định ai đụng đến hồ sơ của mình
  ├─ Bác sĩ chỉ CÓ THỂ ORDER, chưa được LÀM
  ├─ Lab Tech chỉ CÓ THỂ LÀM khi bệnh nhân đồng ý
  └─ Không sync = không tiếp tục được

WORKFLOW ORDER:
  Doctor creates order (ORDERED)
       ↓
  Patient reviews & approves (CONSENTED)  ← CRITICAL STEP
       ↓
  Lab Tech can now perform tests
```

### 📤 Patient Receives Notification

```
System sends notification to patient:
┌─────────────────────────────────────────┐
│  "Doctor Minh vừa tạo yêu cầu xét       │
│   nghiệm cho bạn:                       │
│                                         │
│  ✓ Glucose lúc đói                      │
│  ✓ Hemoglobin A1C                       │
│  ✓ Công thức máu toàn phần              │
│                                         │
│  Bạn có đồng ý thực hiện không?"        │
│                                         │
│  [HỦY]  [ĐỒNG Ý]                        │
└─────────────────────────────────────────┘

Patient reviews:
  - Ai yêu cầu? Doctor Minh ✓
  - Xét nghiệm gì? Kiểm tra tiểu đường ✓
  - Tại sao? Có triệu chứng mệt mỏi ✓
  
Patient decision: CLICK [ĐỒNG Ý]
```

### 🖥️ Patient API Call

```http
POST /v1/patients/lab-orders/1/consent HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
    "consent": true,
    "timestamp": "2026-04-09T11:00:00Z"
}
```

**JWT Token (Patient):**

```javascript
{
    sub: "507f1f77bcf86cd799439020",        // Patient user ID
    email: "patient_a@gmail.com",
    walletAddress: "0xPATIENT111222333444555666",
    role: "PATIENT",
    iat: 1712680200,
    exp: 1712766600
}
```

### 🔐 Backend Service Verification

```javascript
// File: src/services/labOrder.service.js

const consentLabOrder = async (recordId, patientUser) => {
    // [TIME: 11:00:01]
    console.log(`[11:00:01] Patient ${patientUser.email} consenting to order ${recordId}`);
    
    // ▶️ STEP 1: Verify patient permission
    // [TIME: 11:00:02]
    console.log('[11:00:02] Verifying patient ownership of record...');
    
    // Get record from blockchain (source of truth)
    const record = await blockchainContracts.read.ehrManager.getRecord(recordId);
    
    /*
    Result:
    {
        id: 1,
        patient: 0xPATIENT111222333444555666,
        author: 0xDOCTOR_MINH_AABBCCDDEEFF,
        status: "ORDERED",
        ...
    }
    */
    
    const patientWallet = patientUser.walletAddress;  // 0xPATIENT111...
    
    if (record.patient !== patientWallet) {
        console.log('[11:00:03] ❌ FORBIDDEN: Wrong patient!');
        throw new ApiError(403, 'This is not your record');
    }
    
    console.log('[11:00:03] ✅ Patient ownership verified');
    
    // ▶️ STEP 2: Verify current status is ORDERED
    // [TIME: 11:00:04]
    console.log('[11:00:04] Checking current status...');
    
    if (record.status !== 'ORDERED') {
        console.log(`[11:00:04] ❌ Invalid status: ${record.status}`);
        throw new ApiError(400, `Cannot consent at status ${record.status}`);
    }
    
    console.log('[11:00:04] ✅ Status is ORDERED, can proceed');
    
    // ▶️ STEP 3: Call blockchain smart contract
    // [TIME: 11:00:05]
    console.log('[11:00:05] 🔗 Calling blockchain patientConsent...');
    
    // ⚠️ CRITICAL: Patient must sign this transaction with their wallet
    const txHash = await blockchainContracts.write.ehrManager
        .patientConsent(recordId, {
            // Transaction will be signed by patient's wallet
            // msg.sender on blockchain = patient's wallet address
        });
    
    console.log(`[11:00:15] 🔗 Transaction confirmed: ${txHash}`);
    
    // ▶️ STEP 4: Update MongoDB (sync with blockchain)
    // [TIME: 11:00:16]
    console.log('[11:00:16] Updating MongoDB status...');
    
    await labOrderModel.update(recordId, {
        status: 'CONSENTED',
        consentedAt: new Date(),
        consentedBy: patientUser._id,
        consentTxHash: txHash
    });
    
    console.log('[11:00:17] ✅ Status updated to CONSENTED');
    
    // ▶️ STEP 5: Log audit trail
    // [TIME: 11:00:18]
    await auditLogModel.createLog({
        userId: patientUser._id,
        action: 'CONSENT_LAB_ORDER',
        entityType: 'LAB_ORDER',
        entityId: recordId,
        details: {
            txHash: txHash,
            status: 'CONSENTED',
            timestamp: new Date()
        }
    });
    
    console.log('[11:00:18] ✅ Audit log created');
    return { success: true, txHash, status: 'CONSENTED' };
};
```

### ⛓️ Smart Contract: patientConsent Function

```solidity
// EHRManager.sol

/// @notice Patient explicitly consents to the lab order
/// @dev Only the patient of the record can call this
/// @dev Record status must be ORDERED to consent
function patientConsent(uint256 recordId) external recordExists(recordId) {
    Record storage r = records[recordId];
    
    // ✅ Only the PATIENT can consent
    if (msg.sender != r.patient) revert AccessDenied();
    
    // ✅ Status must be ORDERED
    if (r.status != RecordStatus.ORDERED) revert InvalidStatusTransition();
    
    // Update status
    r.status = RecordStatus.CONSENTED;
    r.updatedAt = uint64(block.timestamp);
    
    // Emit event for audit trail
    emit PatientConsented(
        recordId,
        msg.sender,  // Patient's wallet
        block.timestamp
    );
    
    cout << "[Blockchain] Patient consented to record " << recordId;
}

/// @notice Emit when patient consents
event PatientConsented(
    uint256 indexed recordId,
    address indexed patient,
    uint256 timestamp
);
```

**Timeline:**

```
11:00:00 Patient clicks [ĐỒNG Ý]
    ↓
11:00:01 Backend receives request
    ↓
11:00:02 Verify patient ownership
    ↓
11:00:03 ✓ Ownership verified
    ↓
11:00:04 Check status = ORDERED
    ↓
11:00:05 Call blockchain patientConsent()
    ↓
11:00:15 Transaction confirmed on blockchain
    ↓
11:00:16 Update MongoDB status → CONSENTED
    ↓
11:00:18 ✅ Log in audit trail
```

### 📊 Blockchain State After Consent

```solidity
// BEFORE consent:
records[1] = {
    status: ORDERED,
    ...
}

// AFTER patient calls patientConsent():
records[1] = {
    status: CONSENTED,  // ← Status changed!
    updatedAt: 1712684400,
    ...
}

// Events log:
Block 1000002:
  Event: PatientConsented(
    indexed recordId: 1,
    indexed patient: 0xPATIENT111...,
    timestamp: 1712684400
  )
  
  Interpretation: Patient at address 0xPATIENT111 consented to record 1
  Timestamp: 2026-04-09 11:00:00 UTC
  Proof: Immutable on blockchain
```

### 🚫 What Happens if Patient Rejects?

```javascript
// If patient calls with consent: false
const rejectLabOrder = async (recordId, patientUser) => {
    const record = await blockchainContracts.read.ehrManager.getRecord(recordId);
    
    if (record.patient !== patientUser.walletAddress) {
        throw new ApiError(403, 'Not your record');
    }
    
    // Call smart contract to revoke
    await blockchainContracts.write.ehrManager.revokeConsent(recordId);
    
    // Status → REVOKED (or keep ORDERED if rejected before CONSENTED)
    // Lab Tech CANNOT proceed
};
```

---

## 🧬 STEP 3: Lab Tech Posts Test Results

### � Lab Tech Retrieves Pending Orders

Before posting results, Lab Tech must see what orders are ready to process:

```http
GET /v1/lab-techs/pending-orders HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Backend Service:**

```javascript
// src/services/labOrder.service.js

const getPendingOrders = async () => {
    // Only query orders with CONSENTED status
    // (Patient must have approved first!)
    
    const query = {
        status: 'CONSENTED',  // ← CRITICAL: Only consented orders
        _destroy: false
    };
    
    const orders = await labOrderModel.find(query)
        .sort({ createdAt: 1 });
    
    /*
    Returns:
    [
        {
            _id: ObjectId("lab_order_001"),
            patientId: ObjectId(...),
            doctorId: ObjectId(...),
            testsRequested: [GLUCOSE, A1C, CBC],
            status: "CONSENTED",
            consentedAt: "2026-04-09T11:00:00Z"
        }
    ]
    */
    
    return orders;
};
```

Lab Tech now sees order from bệnh nhân Nguyễn Văn A with 3 tests and **knows patient approved it**.

### 📤 Lab Tech Posts First Test Result

```http
POST /v1/lab-techs/test-results HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
    "medicalRecordId": "507f1f77bcf86cd799439999",
    "testType": "GLUCOSE",
    "rawData": {
        "glucose": "285 mg/dL",           // ← SENSITIVE
        "unit": "mg/dL",
        "referenceRange": "70-100",
        "status": "HIGH",
        "timestamp": "2026-04-09T14:30:00Z",
        "method": "Enzymatic colorimetric"
    }
}
```

### 🔐 Middleware: checkLabOrderConsented (⚠️ NEW)

**Before allowing Lab Tech to post results, middleware MUST verify patient consented:**

```javascript
// File: src/middlewares/checkLabOrderConsented.js

const checkLabOrderConsented = async (req, res, next) => {
    // [TIME: 14:30:00]
    console.log('[14:30:00] Starting checkLabOrderConsented middleware');
    
    const { medicalRecordId } = req.body;
    
    if (!medicalRecordId) {
        throw new ApiError(400, 'medicalRecordId is required');
    }
    
    // [TIME: 14:30:01]
    console.log('[14:30:01] Fetching record from blockchain...');
    
    // Get record from blockchain (source of truth)
    const record = await blockchainContracts.read.ehrManager
        .getRecord(medicalRecordId);
    
    /*
    Record state:
    {
        status: "CONSENTED",  // ← Patient approved!
        patient: 0xPATIENT111...,
        author: 0xDOCTOR_MINH...,
        ...
    }
    */
    
    console.log(`[14:30:02] Record status: ${record.status}`);
    
    // [TIME: 14:30:02]
    // Check status MUST be CONSENTED or RESULT_POSTED (can add more results)
    const allowedStatuses = ['CONSENTED', 'IN_PROGRESS', 'RESULT_POSTED'];
    
    if (!allowedStatuses.includes(record.status)) {
        console.log(`[14:30:02] ❌ FORBIDDEN: Status is ${record.status}`);
        throw new ApiError(403, 
            `Cannot post results when status is ${record.status}. ` +
            `Patient must consent first (status must be CONSENTED)`
        );
    }
    
    console.log('[14:30:02] ✅ Patient consent verified, can proceed');
    
    // Store record in request for later use
    req.recordStatus = record.status;
    
    next();
};

// Register middleware
router.post('/test-results', 
    verifyToken,
    authorizeRoles('LAB_TECH'),
    checkLabOrderConsented,  // ← NEW GUARD
    testResultController.createNew
);
```

### 🗂️ OFF-CHAIN Storage (MongoDB)

```javascript
// Collection: testResults

db.testResults.insertOne({
    _id: ObjectId("test_glucose_001"),
    
    // ✅ References
    patientId: ObjectId("507f1f77bcf86cd799439011"),
    medicalRecordId: ObjectId("507f1f77bcf86cd799439999"),
    labOrderId: ObjectId("lab_order_001"),
    
    // ✅ Lab tech info
    createdBy: ObjectId("lab_tech_001"),
    labTechName: "Nguyễn Thị B",
    labName: "Central Lab",
    
    // ✅ FULL test results stored locally
    testType: "GLUCOSE",
    rawData: {
        glucose: "285 mg/dL",           // ← Lưu chi tiết
        unit: "mg/dL",
        referenceRange: "70-100",
        status: "HIGH",
        timestamp: ISODate("2026-04-09T14:30:00Z"),
        method: "Enzymatic colorimetric"
    },
    
    // ✅ Audit
    createdAt: ISODate("2026-04-09T14:30:00Z")
})

// Sau đó, lab tech post thêm kết quả A1C
db.testResults.insertOne({
    _id: ObjectId("test_a1c_001"),
    testType: "A1C",
    rawData: {
        a1c: "9.2%",                    // ← Lưu chi tiết
        referenceRange: "< 5.7%",
        status: "HIGH",
        timestamp: ISODate("2026-04-09T14:35:00Z")
    }
})

db.testResults.insertOne({
    _id: ObjectId("test_cbc_001"),
    testType: "CBC",
    rawData: {
        "wbc": "7.5 K/uL",              // ← Lưu chi tiết
        "rbc": "4.8 M/uL",
        "hemoglobin": "14.2 g/dL",
        "hematocrit": "42%",
        "platelets": "250 K/uL"
    }
})

// 🔑 KEY: Hết thảy kết quả xét nghiệm chi tiết lưu OFF-CHAIN
```

### 🚀 Backend Service: Post Test Result (Compute Hash)

```javascript
// src/services/testResult.service.js

const createNew = async (labTechUser, orderData) => {
    // [TIME: 14:30:03]
    const startTime = Date.now();
    
    // Step 1: Fetch record from blockchain to validate patient consent
    console.log('[14:30:03] Fetching blockchain record...');
    const record = await blockchainContracts.read.ehrManager
        .getRecord(orderData.medicalRecordId);
    
    if (!['CONSENTED', 'IN_PROGRESS', 'RESULT_POSTED'].includes(record.status)) {
        throw new ApiError(403, 'Patient has not consented to this order');
    }
    
    // [TIME: 14:30:04]
    console.log('[14:30:04] Patient consent verified ✅');
    
    // Step 2: Save test result to MongoDB
    console.log('[14:30:04] Saving to MongoDB...');
    const testResult = await testResultModel.create({
        patientId: orderData.patientId,
        medicalRecordId: orderData.medicalRecordId,
        labOrderId: orderData.labOrderId,
        testType: orderData.testType,
        rawData: orderData.rawData,
        createdBy: labTechUser._id,
        labTechName: labTechUser.fullName,
        labName: labTechUser.labName,
        createdAt: new Date()
    });
    
    // [TIME: 14:30:05]
    console.log('[14:30:05] MongoDB saved ✅');
    console.log('[14:30:05] Computing hash...');
    
    // Step 3: Compute labResultHash
    // Hash includes: testType + rawData (all sensitive values!)
    const hashInput = JSON.stringify({
        testType: testResult.testType,
        rawData: testResult.rawData,
        labTechId: labTechUser._id.toString(),
        timestamp: testResult.createdAt.getTime()
    });
    
    const labResultHash = ethers.solidityKeccak256(
        ['string'],
        [hashInput]
    );
    
    // [TIME: 14:30:06]
    console.log('[14:30:06] Hash computed: ' + labResultHash.substring(0, 20) + '...');
    console.log(`
    ┌─────────────────────────────────────┐
    │ Hash Input (Sensitive Data!)        │
    ├─────────────────────────────────────┤
    │ testType: GLUCOSE                   │
    │ glucose: "285 mg/dL"     ← Included │
    │ unit: "mg/dL"                       │
    │ referenceRange: "70-100"            │
    │ status: "HIGH"                      │
    │ method: "Enzymatic colorimetric"    │
    │ labTechId: ${labTechUser._id}       │
    │ timestamp: 1744329000000            │
    └─────────────────────────────────────┘
    ↓
    Keccak256 Hash = ${labResultHash}
    ↓
    ⚠️ ONLY THIS HASH sent on-chain!
    📊 FULL SENSITIVE DATA stays in MongoDB!
    `);
    
    // Step 4: Send hash to blockchain
    console.log('[14:30:06] Calling blockchain...');
    
    const tx = await blockchainContracts.write.ehrManager.postLabResult(
        orderData.medicalRecordId,
        labResultHash  // ← Only hash, NOT sensitive data!
    );
    
    // [TIME: 14:30:09] (blockchain takes 3 seconds)
    console.log('[14:30:09] Blockchain tx confirmed: ' + tx.hash);
    
    // Step 5: Update record status in blockchain to "IN_PROGRESS"
    await blockchainContracts.write.ehrManager.updateStatus(
        orderData.medicalRecordId,
        'IN_PROGRESS'
    );
    
    // Step 6: Update MongoDB with blockchain reference
    await testResultModel.updateOne(
        { _id: testResult._id },
        {
            labResultHash: labResultHash,
            blockchainTx: tx.hash,
            onChain: true
        }
    );
    
    console.log('[14:30:10] ✅ Test result posted successfully');
    
    return {
        testResult,
        hash: labResultHash,
        tx: tx.hash
    };
};
```

### ⛓️ ON-CHAIN Update (Blockchain State)

```solidity
// contracts/EHRManager.sol

// Before call:
records[1] = {
    status: CONSENTED,           // ← Patient approved
    orderHash: 0xabc123...,
    labResultHash: 0x000000...   // ← Empty
}

// Call from Lab Tech:
postLabResult(1, labResultHash=0xlab456...)

// After call:
records[1] = {
    status: IN_PROGRESS,         // ← Status updated
    orderHash: 0xabc123...,
    labResultHash: 0xlab456...   // ← Hash stored NOW
    labTechId: 0xTECH001...,
    labPostAt: 1744329000
}

// Event emitted:
event LabResultPosted(
    uint256 indexed recordId,
    bytes32 labResultHash,
    address indexed labTech,
    uint256 timestamp
);

// ✅ IMMUTABLE: Lab results posted at 14:30:09 (recorded forever)
// ⚠️ PRIVATE: Only hash visible, actual values hidden
```

### 🔐 Verification Mechanism

When doctor needs results later:

```javascript
// Doctor calls: GET /v1/medical-records/507f1f77bcf86cd799439999

// Backend fetches from MongoDB:
const mongoResult = await testResultModel.findOne({...});
console.log(mongoResult.rawData.glucose);  // "285 mg/dL" ← Full value available

// Backend computes hash:
const computedHash = keccak256(JSON.stringify({
    testType: mongoResult.testType,
    rawData: mongoResult.rawData,
    // ... same fields
}));

// Backend verifies:
const blockchainHash = await ehrs.getRecord(1);
console.log(blockchainHash.labResultHash);

if (computedHash === blockchainHash.labResultHash) {
    console.log('✅ Data verified - NOT tampered');
    return mongoResult;  // Return full data to doctor
} else {
    console.log('⚠️ DATA TAMPERING DETECTED!');
    console.log('Expected hash: ', blockchainHash.labResultHash);
    console.log('Computed hash:', computedHash);
    throw new Error('Data integrity check failed');
}
```

---

## 👨‍⚕️ STEP 4: Doctor Reviews and Interprets Results

### 🔍 Doctor Retrieves Results

```http
GET /v1/medical-records/507f1f77bcf86cd799439999 HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response contains:**

```json
{
    "record": {
        "patient": "Nguyễn Văn A",
        "diagnosis": "Type 2 Diabetes",
        "testResults": [
            {
                "testType": "GLUCOSE",
                "value": "285 mg/dL",        // ← Full data returned
                "status": "HIGH",
                "labTechName": "Nguyễn Thị B"
            }
        ]
    }
}
```

### ✍️ Doctor Posts Medical Interpretation

```http
POST /v1/medical-records/507f1f77bcf86cd799439999/interpretation HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
    "interpretation": "Fasting glucose 285 mg/dL indicates severe hyperglycemia. 
        Recommend immediate medication adjustment. Patient may need insulin therapy.
        Follow-up metformin dosage review. Next check: 7 days."
}
```

### 🚀 Backend: Compute Interpretation Hash

```javascript
// src/services/medicalRecord.service.js

const addInterpretation = async (recordId, doctorUser, interpretationText) => {
    // [TIME: 16:00:00]
    
    // Step 1: Fetch blockchain record
    const record = await blockchainContracts.read.ehrManager
        .getRecord(recordId);
    
    if (record.status !== 'IN_PROGRESS' && record.status !== 'RESULT_POSTED') {
        throw new ApiError(400, 'Lab results must be posted first');
    }
    
    // Step 2: Save interpretation to MongoDB
    const interpretation = await medicalRecordModel.updateOne(
        { _id: recordId },
        {
            clinicalInterpretation: interpretationText,
            interpretedBy: doctorUser._id,
            doctorName: doctorUser.fullName,
            interpretedAt: new Date()
        }
    );
    
    // Step 3: Compute interpretationHash
    const hashInput = JSON.stringify({
        clinicalInterpretation: interpretationText,
        doctorId: doctorUser._id.toString(),
        timestamp: new Date().getTime()
    });
    
    const interpretationHash = ethers.solidityKeccak256(
        ['string'],
        [hashInput]
    );
    
    // Step 4: Send hash to blockchain
    await blockchainContracts.write.ehrManager.postInterpretation(
        recordId,
        interpretationHash  // ← Only hash sent!
    );
    
    // Step 5: Update status to DOCTOR_REVIEWED
    await blockchainContracts.write.ehrManager.updateStatus(
        recordId,
        'DOCTOR_REVIEWED'
    );
    
    return { interpretation, hash: interpretationHash };
};
```

### ⛓️ Final ON-CHAIN State

```solidity
// After interpretation posted:

records[1] = {
    status: DOCTOR_REVIEWED,       // ← Final status
    patient: 0xPATIENT111...,
    author: 0xDOCTOR_MINH...,
    
    // 3 independent hashes:
    orderHash: 0xabc123...,        // ← Order hash
    labResultHash: 0xlab456...,    // ← Lab result hash
    interpretationHash: 0xint789... // ← Interpretation hash
    
    timeline: {
        orderedAt: 1744297200,
        consentedAt: 1744297800,   // ← NEW
        labPostAt: 1744329000,
        interpretedAt: 1744340400
    }
}

// ✅ COMPLETE AUDIT TRAIL on blockchain
// ✅ ALL SENSITIVE DATA in MongoDB
// ✅ NO medical information visible on-chain
```

### ⛓️ ON-CHAIN Storage (Blockchain)

**Step 1: Compute Hash**

```javascript
// Backend computes hash of all test results for this record
const allTestResults = [
    {
        testType: "GLUCOSE",
        rawData: {
            glucose: "285 mg/dL",
            unit: "mg/dL",
            referenceRange: "70-100",
            status: "HIGH",
            timestamp: "2026-04-09T14:30:00Z",
            method: "Enzymatic colorimetric"
        }
    },
    {
        testType: "A1C",
        rawData: {
            a1c: "9.2%",
            referenceRange: "< 5.7%",
            status: "HIGH",
            timestamp: "2026-04-09T14:35:00Z"
        }
    },
    {
        testType: "CBC",
        rawData: {
            "wbc": "7.5 K/uL",
            "rbc": "4.8 M/uL",
            "hemoglobin": "14.2 g/dL",
            "hematocrit": "42%",
            "platelets": "250 K/uL"
        }
    }
];

// Compute Keccak256 of concatenated results
const labResultHash = keccak256(JSON.stringify(allTestResults));
// labResultHash = "0xaabbccdd11223344..."
```

**Step 2: Send Transaction**

```solidity
// Backend calls smart contract
function postLabResult(
    uint256 recordId,              // 1
    bytes32 labResultHash          // 0xaabbccdd11223344... ← CHỈ HASH!
) external {
    Record storage r = records[recordId];
    
    r.labResultHash = labResultHash;   // ← HASH ONLY
    r.status = RecordStatus.RESULT_POSTED;
    r.updatedAt = uint64(block.timestamp);
    
    emit RecordUpdated(recordId, labResultHash, block.timestamp);
}
```

**Blockchain State After**

```solidity
// On-chain, chỉ lưu trữ này:
records[1] = {
    id: 1,
    patient: 0xPATIENT111...,
    author: 0xDOCTOR_MINH...,
    recordType: DIABETES_TEST,
    status: RESULT_POSTED,           // ← Status updated
    orderHash: 0x1a2b3c4d5e...,
    labResultHash: 0xaabbccdd11... , // ← NEW HASH
    interpretationHash: bytes32(0),
    requiredLevel: FULL,
    updatedAt: 1712700600
}

// ❌ NOT STORED on-chain:
// - glucose: "285 mg/dL"
// - a1c: "9.2%"
// - Test method details
// - Lab tech name
// - Any test result values
```

---

## 👨‍⚕️ STEP 3: Doctor Interprets Results

### 🖥️ Request được gửi

```http
POST /v1/doctors/lab-orders/lab_order_001/clinical-interpretation HTTP/1.1
Content-Type: application/json

{
    "clinicalInterpretation": "Kết quả xét nghiệm của bệnh nhân cho thấy glucose máu cao (285 mg/dL, bình thường < 100), A1C 9.2% (bình thường < 5.7%). Những chỉ số này phù hợp với chẩn đoán tiểu đường type 2. Công thức máu toàn phần bình thường. Khuyến cáo: điều chỉnh chế độ ăn, tăng hoạt động thể chất, xem xét liệu pháp thuốc Metformin."
}
```

### 🗂️ OFF-CHAIN Storage (MongoDB)

```javascript
// Update medical record
db.medicalRecords.updateOne(
    { _id: ObjectId("507f1f77bcf86cd799439999") },
    {
        $set: {
            clinicalInterpretation: "Kết quả xét nghiệm của bệnh nhân...",
            status: "DIAGNOSED",
            updatedAt: ISODate("2026-04-09T15:00:00Z")
        }
    }
)

// 🔑 KEY: Full interpretation text lưu OFF-CHAIN
```

### ⛓️ ON-CHAIN Storage (Blockchain)

**Step 1: Compute Hash**

```javascript
const interpretationText = "Kết quả xét nghiệm của bệnh nhân cho thấy glucose máu cao...";
const interpretationHash = keccak256(interpretationText);
// interpretationHash = "0x99887766aabbccdd..."
```

**Step 2: Send Transaction**

```solidity
function addClinicalInterpretation(
    uint256 recordId,                  // 1
    bytes32 interpretationHash         // 0x99887766aabbccdd... ← CHỈ HASH!
) external {
    Record storage r = records[recordId];
    
    r.interpretationHash = interpretationHash;  // ← HASH ONLY
    r.status = RecordStatus.DOCTOR_REVIEWED;
    r.updatedAt = uint64(block.timestamp);
    
    emit InterpretationAdded(recordId, interpretationHash, block.timestamp);
}
```

**Blockchain Final State**

```solidity
records[1] = {
    id: 1,
    patient: 0xPATIENT111...,
    author: 0xDOCTOR_MINH...,
    recordType: DIABETES_TEST,
    status: DOCTOR_REVIEWED,           // ← Final status
    
    // 3 layers of proof (hashes only)
    orderHash: 0x1a2b3c4d5e...,        // Doctor's order metadata hash
    labResultHash: 0xaabbccdd11...,    // Lab tech's result hash
    interpretationHash: 0x99887766...,  // Doctor's interpretation hash
    
    requiredLevel: FULL,
    updatedAt: 1712704200
}

// ❌ NOT STORED on-chain:
// - Order details
// - Test results
// - Interpretation text
// - Any sensitive data
```

---

## 📊 COMPARISON TABLE: What Gets Stored Where

| Data | MongoDB (OFF-CHAIN) | Blockchain (ON-CHAIN) | Lý Do |
|------|----------------------|----------------------|-------|
| **Order Details** | ✅ Full | ❌ Hash only | Save gas, keep data private |
| Order test list | ✅ Yes | ❌ No | Sensitive medical data |
| Order priority | ✅ Yes | ❌ No | Not needed on-chain |
| Order clinical note | ✅ Yes | ❌ No | Too large for blockchain |
| Order diagnosis code | ✅ Yes | ❌ No | Private info |
| **Test Results** | ✅ Full | ❌ Hash only | Same reason |
| Glucose value | ✅ 285 mg/dL | ❌ No | Sensitive value |
| A1C value | ✅ 9.2% | ❌ No | Sensitive value |
| CBC values | ✅ WBC, RBC, etc | ❌ No | Sensitive values |
| Test timestamp | ✅ Yes | ❌ In record hash | Included in results |
| Lab tech name | ✅ Yes | ❌ No | Private |
| **Interpretation** | ✅ Full | ❌ Hash only | Same reason |
| Interpretation text | ✅ Yes | ❌ No | Too large |
| Doctor diagnosis | ✅ Yes | ❌ No | Sensitive |
| Recommendations | ✅ Yes | ❌ No | Sensitive |
| **Verification Data** | ✅ Store | ✅ Store | Proof of integrity |
| orderHash | ✅ Yes | ✅ Yes | Verify not tampered |
| labResultHash | ✅ Yes | ✅ Yes | Verify not tampered |
| interpretationHash | ✅ Yes | ✅ Yes | Verify not tampered |
| Record ID | ❌ No | ✅ Yes | Chain of custody |
| Status | ✅ Yes | ✅ Yes | Workflow tracking |
| Timestamps | ✅ Yes | ✅ Yes | Audit trail |

---

## 🔍 VERIFICATION FLOW: How Integrity is Verified

### Scenario: Verify test results were not tampered

```javascript
// Someone wants to verify: "Were lab results modified after posting?"

const verifyLabResults = async (recordId) => {
    // Step 1: Get stored data from MongoDB
    const testResults = await db.testResults.find({
        medicalRecordId: recordId
    });
    
    /*
    Results:
    [
        {
            testType: "GLUCOSE",
            rawData: { glucose: "285 mg/dL", ... }
        },
        ...
    ]
    */
    
    // Step 2: Compute hash locally
    const computedHash = keccak256(JSON.stringify(testResults));
    // computedHash = "0xaabbccdd11223344..."
    
    // Step 3: Get blockchain hash
    const record = await blockchain.records(recordId);
    const blockchainHash = record.labResultHash;
    // blockchainHash = "0xaabbccdd11223344..."
    
    // Step 4: Compare
    if (computedHash === blockchainHash) {
        console.log("✅ Test results AUTHENTIC (not modified)");
    } else {
        console.warn("❌ WARNING: Test results have been MODIFIED!");
        console.warn(`Expected: ${blockchainHash}`);
        console.warn(`Actual: ${computedHash}`);
    }
};

// Usage
await verifyLabResults(1);
// Output: ✅ Test results AUTHENTIC (not modified)
```

---

## 🎯 KEY INSIGHTS

### 1️⃣ Blockchain ONLY Stores Hashes

```
Doctor Order
    ↓
Full metadata (testsRequested, priority, clinicalNote) 
    ├─→ MongoDB (private, encrypted)
    └─→ Compute Keccak256 → Blockchain (visible, immutable)

Same for test results and interpretation
```

### 2️⃣ Why This Design?

| Benefit | Explanation |
|---------|------------|
| **Privacy** | Patient medical data stays private, not on public blockchain |
| **Gas Efficiency** | Blockchain only stores small hashes (32 bytes), not large data |
| **Speed** | MongoDB is fast, blockchain is slow |
| **Compliance** | Can meet HIPAA/GDPR requirements (data private by default) |
| **Integrity** | Hash mismatch proves tampering occurred |
| **Immutability** | Once hashes posted on-chain, can't be modified |

### 3️⃣ Data Flow Summary

```
Doctor creates order with tests
    ↓
testsRequested = ["GLUCOSE", "A1C", "CBC"]
    ↓
Split into:
    ├─→ MongoDB: Store FULL array
    └─→ Blockchain: Store ONLY HASH of array

Lab posts test results (glucose 285, A1C 9.2%, etc)
    ↓
rawData = { glucose: "285", a1c: "9.2", ... }
    ↓
Split into:
    ├─→ MongoDB: Store FULL values
    └─→ Blockchain: Store ONLY HASH of values

Doctor adds interpretation
    ↓
clinicalInterpretation = "Full text..."
    ↓
Split into:
    ├─→ MongoDB: Store FULL text
    └─→ Blockchain: Store ONLY HASH of text

Result:
    ✅ All sensitive data private in MongoDB
    ✅ All hashes immutable on blockchain
    ✅ Integrity verifiable: hash(current_data) == blockchain_hash
    ✅ Audit trail: Who did what, when (events on blockchain)
```

---

## ⚡ QUICK REFERENCE: What NOT on Blockchain

```
❌ GLUCOSE: "285 mg/dL"          → Only hash stored
❌ A1C: "9.2%"                   → Only hash stored
❌ Blood Group: "O+"             → Not sent at all
❌ Hemoglobin: "14.2 g/dL"       → Only hash stored
❌ White Blood Cell: "7.5 K/uL"  → Only hash stored
❌ Test methods                  → Not sent at all
❌ Lab notes                     → Not sent at all
❌ Clinical interpretation text  → Only hash stored

✅ What IS on blockchain:
  - recordId (reference)
  - Record status (ORDERED, RESULT_POSTED, DOCTOR_REVIEWED)
  - orderHash (proof of order integrity)
  - labResultHash (proof of results integrity)
  - interpretationHash (proof of interpretation integrity)
  - Timestamps (audit trail)
  - Access control events
```
