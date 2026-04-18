# 📋 PATCH `/v1/lab-orders/:id/interpretation` - Add Clinical Interpretation (Step 7)

## 📌 Overview

**Endpoint:** `PATCH /v1/lab-orders/:id/interpretation`  
**Role Required:** `DOCTOR`  
**Auth:** Bearer Token (JWT)  
**Step in Workflow:** Step 7 of 8  
**Status Transition:** `RESULT_POSTED` → `DOCTOR_REVIEWED`  
**Blockchain Action:** Calls `EHRManager.addClinicalInterpretation()`

---

## 🔍 What This Endpoint Does

1. **Medical Context:** Doctor reads lab results and provides clinical interpretation
2. **Data Storage:**
   - Interpretation data stored in MongoDB (off-chain) with full details
   - Only **hash** of interpretation stored on blockchain (privacy + security)
3. **Blockchain Call:** Calculates `keccak256` hash → calls smart contract
4. **Status Update:** MongoDB record status changes from `RESULT_POSTED` → `DOCTOR_REVIEWED`
5. **Access Control:** Verifies doctor has sufficient access level to patient's record

---

## 📤 Request

### URL Parameters

```
:id (path parameter)
  Type: MongoDB ObjectId (string)
  Example: "69d867a894664aa591ff617d"
  Description: Lab order ID to add interpretation to
```

### Request Headers

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "interpretation": "string (REQUIRED)",
  "recommendation": "string (REQUIRED)",
  "confirmedDiagnosis": "string (REQUIRED)",
  "interpreterNote": "string (OPTIONAL)"
}
```

#### Field Details

| Field | Type | Required | Max Length | Description |
|-------|------|----------|-----------|-------------|
| `interpretation` | String | ✅ Yes | - | Clinical findings & analysis of lab results |
| `recommendation` | String | ✅ Yes | - | Treatment/follow-up recommendations |
| `confirmedDiagnosis` | String | ✅ Yes | - | **DOCTOR MUST EXPLICITLY CONFIRM** (not auto-filled) |
| `interpreterNote` | String | ❌ No | - | Internal notes for audit trail |

#### ⚠️ Important: `confirmedDiagnosis` Logic

```
WHY it's REQUIRED (must not be auto-filled):

Initial Diagnosis (at Step 3):
  - Made WITHOUT lab results
  - Is a HYPOTHESIS
  - Example: E11 (Suspected Type 2 Diabetes)

Confirmed Diagnosis (at Step 7):
  - Made AFTER reviewing lab results
  - Can be COMPLETELY DIFFERENT
  - Example: Pre-diabetes (HbA1c = 5.8%, not diabetic)

REAL-WORLD CONSEQUENCES:
  ❌ Auto-fill can cause EHR errors
  ✅ Requiring confirmation ensures doctor reviews every diagnosis

FRONTEND STRATEGY (UX Optimization):
  1. When opening "Add Interpretation" form
  2. Fetch the medical record diagnosis
  3. Pre-fill confirmedDiagnosis field with current value
  4. Doctor reviews and can modify
  Result: Smooth UX + medical correctness maintained
  
Analogy: Epic EHR, OpenMRS, production hospital systems all do this
```

---

## 📥 Response (Success - 200 OK)

```json
{
  "message": "Thêm diễn giải lâm sàng thành công",
  "orderId": "69d867a894664aa591ff617d",
  "blockchainRecordId": "1",
  "txHash": "0x5f3759df1a...",
  "status": "DOCTOR_REVIEWED",
  "interpretationHash": "0x5503e9402...",
  "confirmedDiagnosis": "E11",
  "syncStatus": "COMPLETED",
  "updatedAt": "2026-04-14T14:35:40.123Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Success message |
| `orderId` | String | MongoDB lab order ID |
| `blockchainRecordId` | String | On-chain record ID |
| `txHash` | String | Blockchain transaction hash |
| `status` | String | New status: `DOCTOR_REVIEWED` |
| `interpretationHash` | String | `keccak256(interpretation + recommendation)` |
| `confirmedDiagnosis` | String | Confirmed diagnosis (echoed back) |
| `syncStatus` | String | Event sync result: `COMPLETED` \| `FAILED_RETRY_LATER` \| `PENDING` |
| `updatedAt` | ISO String | Timestamp when interpretation was saved |

---

## ❌ Error Responses

### 400 Bad Request - Order not in RESULT_POSTED status

```json
{
  "statusCode": 400,
  "message": "Chỉ có thể thêm diễn giải khi order ở trạng thái RESULT_POSTED, hiện tại: DOCTOR_REVIEWED",
  "timestamp": "2026-04-14T14:35:10.777Z"
}
```

### 400 Bad Request - Missing confirmedDiagnosis

```json
{
  "statusCode": 400,
  "message": "Field \"confirmedDiagnosis\" is REQUIRED. Doctor must explicitly confirm diagnosis after reviewing lab results. (Frontend should pre-fill from medical record.diagnosis for convenience)",
  "timestamp": "2026-04-14T14:35:10.777Z"
}
```

### 400 Bad Request - Blockchain error (AccessDenied)

```json
{
  "statusCode": 400,
  "message": "Gọi blockchain addClinicalInterpretation thất bại: execution reverted (unknown custom error) (action=\"estimateGas\", data=\"0x1117a646\", reason=null, ...)",
  "timestamp": "2026-04-14T14:35:10.777Z"
}
```

### 403 Forbidden - Not a doctor

```json
{
  "statusCode": 403,
  "message": "Only DOCTOR can add clinical interpretations"
}
```

### 404 Not Found - Lab order doesn't exist

```json
{
  "statusCode": 404,
  "message": "Không tìm thấy lab order"
}
```

---

## 🔗 Code Architecture

### Call Flow

```
HTTP Request
    ↓
[labOrder.route.js Line 378]
  Router.patch('/:id/interpretation', verifyToken, authorizeRoles('DOCTOR'), ...)
    ↓
[ehrWorkflow.controller.js Line 71]
  addClinicalInterpretation(req, res, next)
    req.params.id = lab order MongoDB ID
    req.body = { interpretation, recommendation, confirmedDiagnosis, interpreterNote }
    req.user = { _id, walletAddress, role, ... }
    ↓
[ehrWorkflow.service.js Line 384]
  ehrWorkflowService.addClinicalInterpretation(currentUser, labOrderId, interpretationData)
    ↓
[MAIN LOGIC SECTION - See below]
```

---

## 🔧 Service Implementation Details

### File: `src/services/ehrWorkflow.service.js`

**Function:** `addClinicalInterpretation(currentUser, labOrderId, interpretationData)`  
**Location:** Lines 384-753

#### Step-by-Step Logic

##### 1️⃣ Input Validation (Lines 390-418)

```javascript
// Verify role = DOCTOR (redundant check beyond middleware)
await verifyRole(currentUser, 'DOCTOR');

// Extract request body fields
const { interpretation, recommendation, confirmedDiagnosis, interpreterNote } = interpretationData;

// confirmedDiagnosis is REQUIRED
if (!confirmedDiagnosis) {
  throw new ApiError(400, 'confirmedDiagnosis is REQUIRED...');
}
```

**Why two checks?**

- Middleware `authorizeRoles()` is first line of defense
- Service repeats check as safety ("never trust middleware alone")
- Follows [HIGH FIX #1 & #2] pattern in codebase

##### 2️⃣ Fetch Lab Order from MongoDB (Lines 419-430)

```javascript
const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);

if (!labOrder) {
  throw new ApiError(404, 'Không tìm thấy lab order');
}
```

##### 3️⃣ Auto-Fix Missing `requiredLevel` (Lines 432-445)

```javascript
// If old order missing requiredLevel field, calculate it
if (!labOrder.requiredLevel) {
  const calculatedLevel = labOrder.recordType === 'HIV_TEST' ? 3 : 2;
  labOrder.requiredLevel = calculatedLevel;
  await labOrder.save({ validateBeforeSave: false });
}
```

**Why needed?**

- Old lab orders created before `requiredLevel` field was added
- On-chain contract uses `requiredLevel` for access control
- Must match: `accessControl.checkAccessLevel(patient, doctor, requiredLevel)`
- See: Access Control section below

##### 4️⃣ Status Validation (Lines 447-452)

```javascript
// Only allow interpretation when status = RESULT_POSTED
if (labOrder.sampleStatus !== 'RESULT_POSTED') {
  throw new ApiError(400, 
    `Chỉ có thể thêm diễn giải khi order ở trạng thái RESULT_POSTED, hiện tại: ${labOrder.sampleStatus}`
  );
}
```

**Valid status flow:**

```
RESULT_POSTED (only status where interpretation is allowed)
      ↓
addClinicalInterpretation() called
      ↓
DOCTOR_REVIEWED (new status after success)
```

##### 5️⃣ Wallet Normalization (Lines 454-457)

```javascript
const normalizedDoctorAddress = normalizeWalletAddress(currentUser.walletAddress);
// Converts to lowercase, removes whitespace
// Reason: blockchain addresses are case-insensitive but must be consistent
```

##### 6️⃣ Create Interpretation Hash (Lines 459-464)

```javascript
// Hash = keccak256(interpretation + recommendation)
const interpretationHash = ethers.keccak256(
  ethers.toUtf8Bytes(interpretation + (recommendation || ''))
);

// Hash stored on blockchain as proof
// Full interpretation data stays in MongoDB (off-chain)
```

**Why hash instead of full data?**

```
Blockchain constraint: Gas-expensive to store large text
Solution:
  - Full interpretation → MongoDB (off-chain)
  - Only hash → Blockchain (on-chain)
  - Hash serves as "proof of interpretation" and allows verification
```

##### 7️⃣ Access Control Verification (Lines 467-489)

```javascript
// Check: Does doctor have permission to interpret this patient's records?
const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
  normalizedPatientAddr,      // Patient address
  normalizedDoctorAddr,       // Doctor address  
  requiredLevelForCheck       // Min required level
);

if (!hasAccess) {
  throw new ApiError(403, 'Doctor does not have access...');
}
```

**Access Levels Reference:**

```
0: NONE       - No access
1: EMERGENCY  - Emergency access only
2: FULL       - Standard access
3: SENSITIVE  - Full + sensitive data (HIV_TEST records)
```

**RequiredLevel Calculation:**

```javascript
labOrder.recordType === 'HIV_TEST' ? 3 : 2
```

- HIV records need higher sensitivity level (3)
- Other records use standard level (2)

##### 8️⃣ Blockchain Call (Lines 491-548)

```javascript
// Call smart contract with doctor's wallet
const tx = await blockchainContracts.doctor.ehrManager.addClinicalInterpretation(
  recordId,           // On-chain record ID
  interpretationHash  // Hash only
);

const receipt = await tx.wait();
const txHash = receipt.hash;
```

**Smart Contract Behavior:**

```solidity
function addClinicalInterpretation(uint256 recordId, bytes32 interpretationHash) {
  // Contract verifies:
  // 1. msg.sender is a DOCTOR
  // 2. Record status = RESULT_POSTED
  // 3. Doctor has access level >= recordRequiredLevel
  
  // Then:
  // 1. Updates status to DOCTOR_REVIEWED
  // 2. Stores interpretationHash on-chain
  // 3. Emits ClinicalInterpretationAdded event
}
```

**Possible Errors from Contract:**

```
0x1117a646: AccessDenied() - Doctor lacks access or access expired
- Check: is access grant still valid?
- Check: does doctor have sufficient access level?
```

##### 9️⃣ Update MongoDB Status (Lines 550-575)

```javascript
// 🆕 CRITICAL FIX: Update MongoDB FIRST (before event sync)
const now = new Date();
labOrder.sampleStatus = 'DOCTOR_REVIEWED';
labOrder.interpretationHash = interpretationHash;
labOrder.clinicalInterpretation = interpretation;
labOrder.recommendation = recommendation;
labOrder.interpreterNote = interpreterNote;
labOrder.doctorId = currentUser._id?.toString();
labOrder.auditLogs.push({
  from: 'RESULT_POSTED',
  to: 'DOCTOR_REVIEWED',
  by: normalizedDoctorAddress,
  at: now,
  txHash,
});

await labOrder.save();
```

**Why this order matters:**

1. Blockchain call succeeds first
2. IMMEDIATELY update MongoDB with new status
3. Then sync events (optional, won't block if fails)

**Previous Bug (Fixed):**

```
OLD ORDER (WRONG):
  1. Blockchain call succeeds ✅
  2. Event sync runs ⏳
  3. MongoDB save happens last ❌ (if event sync fails, save never persists)
  
NEW ORDER (CORRECT):
  1. Blockchain call succeeds ✅
  2. MongoDB save persists immediately ✅
  3. Event sync happens (even if fails, MongoDB already updated) ✅
```

##### 🔟 Event Sync (Lines 577-620)

```javascript
// Capture ClinicalInterpretationAdded event from blockchain
const syncResult = await blockchainEventSyncService.syncEvents(
  syncBlockNumber, 
  syncBlockNumber + 10
);
```

**What happens in sync:**

```
Blockchain emits: ClinicalInterpretationAdded event
  ↓
Backend event listener catches it
  ↓  
Eventhandler updates Lab Order (if not already updated):
    labOrder.interpretationHash = event.interpretationHash
    labOrder.save()
  ↓
Audit log created: 'CLINICAL_INTERPRETATION_ADDED_ON_CHAIN'
```

**Why auto-sync?**

- Ensure consistency between MongoDB and blockchain
- Immediate feedback to patient dashboard
- Fallback for any other clients watching events

##### 1️⃣1️⃣ Medical Record Sync (Lines 622-639)

```javascript
// Auto-sync the confirmed diagnosis back to medical record
// Early Binding relationship already created in Step 3
if (labOrder.relatedMedicalRecordId) {
  await medicalRecordService.syncConfirmedDiagnosisFromInterpretation(
    labOrder.relatedMedicalRecordId,
    { confirmedDiagnosis, interpretationHash, doctorId }
  );
}
```

**Why needed:**

- Patient can have multiple lab orders
- Each might have different confirmed diagnosis
- Medical record should track the latest confirmed diagnosis
- But sync should NOT fail main flow (use try-catch)

##### 1️⃣2️⃣ Audit Logging (Lines 641-656)

```javascript
await auditLogModel.createLog({
  userId: currentUser._id,
  walletAddress: normalizedDoctorAddress,
  action: 'ADD_CLINICAL_INTERPRETATION',
  entityType: 'LAB_ORDER',
  entityId: labOrder._id,
  txHash,
  status: 'SUCCESS',
  details: {
    note: `Doctor added clinical interpretation for lab order ${labOrderId}`,
    recordId,
    interpretationHash,
    confirmedDiagnosis,
    syncStatus,
  },
});
```

**Audit Trail Captures:**

- Who (doctor)
- When (timestamp)
- What (interpretation added)
- Blockchain proof (txHash)
- Medical decision (confirmedDiagnosis)

##### 1️⃣3️⃣ Return Response (Lines 658-667)

```javascript
return {
  message: 'Thêm diễn giải lâm sàng thành công',
  orderId: labOrder._id.toString(),
  blockchainRecordId: recordId,
  txHash,
  status: 'DOCTOR_REVIEWED',
  interpretationHash,
  confirmedDiagnosis,
  syncStatus,
  updatedAt: now,
};
```

---

## 🧪 Test Scenario

### Prerequisite State

- Lab order status = `RESULT_POSTED`
- Doctor has valid access grant to patient
- Doctor wallet is registered as DOCTOR in contract

### Sample Request

```bash
curl -X PATCH \
  http://localhost:8018/v1/lab-orders/69d867a894664aa591ff617d/interpretation \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "interpretation": "Glucose 145 mg/dL (cao), HbA1c 7.2% (cao). Bệnh nhân có tiểu đường type 2",
    "recommendation": "1. Điều chỉnh chế độ ăn. 2. Tăng vận động 30 phút/ngày. 3. Tái khám sau 3 tháng",
    "confirmedDiagnosis": "E11 (Type 2 Diabetes confirmed by HbA1c)",
    "interpreterNote": "[Optional] Additional clinical notes"
  }'
```

### Expected Response (200 OK)

```json
{
  "message": "Thêm diễn giải lâm sàng thành công",
  "orderId": "69d867a894664aa591ff617d",
  "blockchainRecordId": "1",
  "txHash": "0x5f3759df1a2c49fa...",
  "status": "DOCTOR_REVIEWED",
  "interpretationHash": "0x5503e9402...",
  "confirmedDiagnosis": "E11 (Type 2 Diabetes confirmed by HbA1c)",
  "syncStatus": "COMPLETED",
  "updatedAt": "2026-04-14T14:35:40.123Z"
}
```

### Verify on Blockchain

```bash
node scripts/check-onchain-requiredlevel.js

Output:
  ✅ Record ID: 1
  ✅ Status: 4 (DOCTOR_REVIEWED)
  ✅ Interpretation Hash: 0x5503e9402...
```

---

## 🔐 Security & Validation

### 1. Role-Based Access Control

```
✅ Request must have:
  - Valid JWT token
  - Token must have role = 'DOCTOR'
  - Token must have non-deleted, ACTIVE account

Verified at:
  - [Middleware] authorizeRoles('DOCTOR')
  - [Service] verifyRole(currentUser, 'DOCTOR')
```

### 2. Medical Record Access Control

```
✅ Doctor must have grant from patient:
  - checkAccessLevel(patient, doctor, requiredLevel) = true
  - Grant must not be expired
  - Grant level must be >= record requiredLevel

Verified at:
  - [Service] blockchainContracts.read.accessControl.checkAccessLevel()
  - [Contract] AccessControl.sol checks expiration timestamp
```

### 3. Status Validation

```
✅ Lab order must be in exactly RESULT_POSTED status:
  - No interpretation if status is ORDERED, IN_PROGRESS, etc.
  - No double-interpretation (prevents overwriting existing interpretation)

Verified at:
  - [Service] if (labOrder.sampleStatus !== 'RESULT_POSTED')
```

### 4. Immutability

```
✅ Once record moves to DOCTOR_REVIEWED status:
  - No one can modify order, results, or diagnosis
  - Only Step 8 (completeRecord) can execute next
  - Prevents tampering with medical records
```

---

## 📊 Database Changes

### MongoDB Collection: `lab_orders`

**Before Request (RESULT_POSTED state):**

```json
{
  "_id": "69d867a894664aa591ff617d",
  "sampleStatus": "RESULT_POSTED",
  "interpretationHash": null,
  "clinicalInterpretation": null,
  "recommendation": null,
  "confirmedDiagnosis": null,
  "auditLogs": [
    { from: "ORDERED", to: "RESULT_POSTED", by: "labtech...", txHash: "0x...", at: "2026-04-14T14:30:00Z" }
  ]
}
```

**After Request (DOCTOR_REVIEWED state):**

```json
{
  "_id": "69d867a894664aa591ff617d",
  "sampleStatus": "DOCTOR_REVIEWED",
  "interpretationHash": "0x5503e9402...",
  "clinicalInterpretation": "Glucose 145 mg/dL (cao)...",
  "recommendation": "1. Điều chỉnh chế độ ăn...",
  "confirmedDiagnosis": "E11 (Type 2 Diabetes confirmed by HbA1c)",
  "auditLogs": [
    { from: "ORDERED", to: "RESULT_POSTED", by: "labtech...", txHash: "0x...", at: "2026-04-14T14:30:00Z" },
    { from: "RESULT_POSTED", to: "DOCTOR_REVIEWED", by: "doctor...", txHash: "0x5f3759df1a...", at: "2026-04-14T14:35:40Z" }
  ]
}
```

### Blockchain: EHRManager.sol

**Record State Before:**

```solidity
struct Record {
  uint256 id: 1
  RecordStatus status: 3 (RESULT_POSTED)
  bytes32 labResultHash: 0x762a977fb...
  bytes32 interpretationHash: bytes32(0) // empty
}
```

**Record State After:**

```solidity
struct Record {
  uint256 id: 1
  RecordStatus status: 4 (DOCTOR_REVIEWED)  ← CHANGED
  bytes32 labResultHash: 0x762a977fb...
  bytes32 interpretationHash: 0x5503e9402...  ← SET
}
```

---

## 🐛 Known Issues & Fixes

### Issue #1: Race Condition - Event Sync Before MongoDB Save (FIXED)

**Problem:**

- Event sync happens before MongoDB save
- If sync fails, MongoDB save never executes
- Blockchain updated but MongoDB stuck in RESULT_POSTED

**Solution:**

- Move MongoDB save BEFORE event sync
- Ensure status persists regardless of event sync result
- Event sync is now async enhancement, not blocking

**Code Location:**

- [ehrWorkflow.service.js Line 550] MongoDB save now happens first
- [ehrWorkflow.service.js Line 577] Event sync is secondary

### Issue #2: Missing `requiredLevel` in Old Records (FIXED)

**Problem:**

- Old lab orders created before `requiredLevel` field existed
- When adding interpretation, `requiredLevel` was undefined
- Contract call failed with AccessDenied

**Solution:**

- Auto-calculate `requiredLevel` if missing
- Apply formula: `recordType === 'HIV_TEST' ? 3 : 2`
- Save to MongoDB to prevent recalculation

**Code Location:**

- [ehrWorkflow.service.js Line 432] Auto-fix logic

### Issue #3: Wallet Address Casing (FIXED)

**Problem:**

- Some parts of code used uppercase addresses: `0xABC123...`
- Others used lowercase: `0xabc123...`
- Comparison failed due to case mismatch

**Solution:**

- Always normalize to lowercase
- Use helper function `normalizeWalletAddress()`
- Apply consistently in access control checks

**Code Location:**

- [ehrWorkflow.service.js Line 19] `normalizeWalletAddress()` helper
- [ehrWorkflow.service.js Line 467] Applied in access check

---

## 📚 Related Dependencies

### Imports

```javascript
import { ethers } from 'ethers';                    // Hashing: keccak256()
import { blockchainContracts } from '~/blockchain/contract';
import { labOrderModel } from '~/models/labOrder.model';
import { auditLogModel } from '~/models/auditLog.model';
import { blockchainEventSyncService } from '~/services/blockchainEventSync.service';
```

### Models

- `labOrderModel.LabOrderModel` - Lab order data
- `auditLogModel` - Audit trail
- `userModel` - User validation
- `medicalRecordModel` - For diagnosis sync

### Smart Contracts (ABI)

- `EHRManager.addClinicalInterpretation()` - Main blockchain call
- `AccessControl.checkAccessLevel()` - Access control check
- `AccountManager.isDoctor()` - Role verification

### Services

- `blockchainEventSyncService.syncEvents()` - Event synchronization
- `medicalRecordService.syncConfirmedDiagnosisFromInterpretation()` - Diagnosis sync

---

## ✅ Validation Checklist

Before calling this endpoint, verify:

- [ ] Lab order exists in database
- [ ] Lab order status = `RESULT_POSTED`
- [ ] Doctor has valid JWT token with role = `DOCTOR`
- [ ] Doctor account is ACTIVE (not deleted/suspended)
- [ ] `confirmedDiagnosis` field is provided (not empty)
- [ ] Doctor has access grant from patient on blockchain
- [ ] Access grant is not expired
- [ ] Doctor's access level >= record's `requiredLevel`
- [ ] `interpretation` and `recommendation` fields are filled

If any check fails, endpoint will return 400/403 error.

---

## 🔄 Next Step (Step 8)

After this endpoint succeeds, doctor can call:

```
PATCH /v1/lab-orders/:id/complete
```

This finalizes the record:

- Status: `DOCTOR_REVIEWED` → `COMPLETE`
- Record becomes immutable on blockchain
- Lab order workflow fully concluded
