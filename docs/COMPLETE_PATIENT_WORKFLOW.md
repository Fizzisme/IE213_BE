# 🏥 Complete Patient Examination Workflow

**From Account Registration to Successful Medical Examination**

---

## 📊 Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│1. PATIENT REGISTRATION & BLOCKCHAIN SETUP                      │
├─────────────────────────────────────────────────────────────────┤
│   • Patient creates account with wallet                         │
│   • Admin approves → Patient moves to ACTIVE                    │
│   • Patient receives blockchain registration                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│2. ACCESS CONTROL - PATIENT GRANTS ACCESS TO DOCTOR              │
├─────────────────────────────────────────────────────────────────┤
│   • Patient grants FULL access to doctor                        │
│   • Doctor can now read patient medical records                 │
│   • Auto-revoke pattern: if access exists, revoke first        │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│3. MEDICAL EXAMINATION - DOCTOR CREATES MEDICAL RECORD           │
├─────────────────────────────────────────────────────────────────┤
│   • Doctor creates examination report                           │
│   • Doctor stores findings/diagnosis                            │
│   • Medical record saved to blockchain                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│4. LAB ORDER - DOCTOR ORDERS LAB TESTS                            │
├─────────────────────────────────────────────────────────────────┤
│   • Doctor creates lab order (blood test, imaging, etc)         │
│   • Order assigned to lab tech                                  │
│   • Lab tech receives & accepts order                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│5. LAB TESTING - LAB TECH EXECUTES & POSTS RESULTS                │
├─────────────────────────────────────────────────────────────────┤
│   • Lab tech processes test                                     │
│   • Lab tech posts test results                                 │
│   • Results stored on blockchain                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│6. DIAGNOSIS - DOCTOR REVIEWS & FINALIZES                         │
├─────────────────────────────────────────────────────────────────┤
│   • Doctor sees lab results                                     │
│   • Doctor finalizes diagnosis                                  │
│   • Patient medical record complete                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Step 1: Patient Registration & Blockchain Setup

### 1.1 Patient Creates Account

**Endpoint:** `POST /api/v1/auth/register`

**Required Fields:**

```json
{
  "email": "patient@example.com",
  "password": "SecurePass@123456",
  "nationId": "123456789012",
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
}
```

**Validations:**

- ✅ Email must be unique
- ✅ Password minimum 8 characters
- ✅ Wallet address format: `0x` + 40 hex characters
- ✅ Wallet must not be zero address (`0x000...000`)
- ✅ Wallet must not be already registered

**Response:**

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB",
  "blockchainStatus": "PENDING"
}
```

**Database State:**

```javascript
// User Document
{
  _id: "507f1f77bcf86cd799439011",
  role: "PATIENT",
  status: "PENDING",
  authProviders: [
    {
      type: "LOCAL",
      email: "patient@example.com",
      passwordHash: "...",
      nationId: "123456789012",
      walletAddress: "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
    }
  ],
  blockchainAccount: {
    status: "PENDING",
    registeredAt: "2026-04-08T10:00:00Z"
  }
}

// Blockchain State
AccountManager.getAccount(0xED95...)
→ status: PENDING (waiting for admin approval)
```

---

### 1.2 Admin Approves Patient

**Endpoint:** `PATCH /api/v1/admins/users/:userId/approve`

**Admin Only:** User with ADMIN role

**Request:**

```json
{
  "targetUserId": "507f1f77bcf86cd799439011"
}
```

**Backend Logic (Transaction Pattern):**

1. ✅ Check blockchain wallet status (must be PENDING or NONE)
2. ✅ Call `AccountManager.approveAccount(walletAddress)` on-chain
3. ✅ Wait for transaction receipt & verify `status === 1`
4. ✅ Call `AccountManager.registerPatient(walletAddress)` on-chain
5. ✅ **ONLY THEN** update database status to ACTIVE
6. ✅ Store transaction hashes in `blockchainAccount` field

**Response:**

```json
{
  "message": "Người dùng được duyệt thành công",
  "txHash": "0xabc123...",
  "approvalTx": "0xdef456..."
}
```

**Database State After:**

```javascript
{
  status: "ACTIVE",
  blockchainAccount: {
    status: "PENDING",        // Still PENDING until patient confirms
    registeredAt: "2026-04-08T10:00:00Z",
    approvedAt: "2026-04-08T10:05:00Z",
    txHash: "0xabc123...",
    approvalTx: "0xdef456..."
  }
}

// Blockchain State
AccountManager.getAccount(0xED95...)
→ status: ACTIVE (approved by admin)
```

---

## 🔗 Step 2: Patient Grants Access to Doctor

### 2.1 Get Doctor's Wallet Address

**Endpoint:** `GET /api/v1/doctor/list`

**Response:**

```json
{
  "doctors": [
    {
      "_id": "507f...",
      "name": "Dr. Nguyen Van A",
      "email": "doctor@hospital.com",
      "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "specialty": "General Medicine",
      "hospital": "City Hospital"
    }
  ]
}
```

### 2.2 Grant Access to Doctor

**Endpoint:** `POST /api/v1/access-control/grant`

**Authentication:** Patient JWT Token

**Request:**

```json
{
  "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "level": "FULL",
  "durationHours": 0
}
```

**Parameters:**

- `accessorAddress`: Doctor's wallet address
- `level`: "FULL" (read all records) or "SENSITIVE" (limited access)
- `durationHours`: 0 = unlimited, 24 = expires in 24 hours

**Backend Logic (Auto-Revoke Pattern):**

1. ✅ Check if access already exists: `getAccessGrant(patient, doctor)`
2. ✅ If `isActive === true`:
   - Auto-revoke: `revokeAccess(doctor)`
   - Wait for receipt & verify success
   - Wait 2 seconds for blockchain state sync
3. ✅ Grant new access: `grantAccess(doctor, FULL, durationHours)`
4. ✅ Wait for receipt & verify success
5. ✅ Create audit log

**Response:**

```json
{
  "message": "Cấp quyền truy cập thành công",
  "txHash": "0xgrants123..."
}
```

**Blockchain State After:**

```javascript
AccessControl.getAccessGrant(patient, doctor)
→ {
  level: 2,           // FULL
  grantedAt: timestamp,
  expiresAt: 0,       // unlimited
  isActive: true
}
```

---

## 🩺 Step 3: Doctor Creates Medical Record (Examination)

### 3.1 Doctor Starts Examination

**Endpoint:** `POST /api/v1/medical-record/create`

**Authentication:** Doctor JWT Token

**Request:**

```json
{
  "patientId": "507f1f77bcf86cd799439011",
  "examinationDate": "2026-04-08T14:30:00Z",
  "chief_complaint": "Headache for 3 days",
  "history_of_present_illness": "Patient reports continuous headache...",
  "vital_signs": {
    "temperature": 36.5,
    "blood_pressure": "120/80",
    "heart_rate": 72,
    "respiratory_rate": 16
  },
  "physical_exam": {
    "general": "Patient appeared well",
    "head": "No abnormalities noted",
    "cardiovascular": "Normal S1, S2 without murmurs"
  },
  "assessment": "Common tension headache",
  "plan": "Prescribe Paracetamol 500mg, rest"
}
```

**Doctor's Access Verification:**

- ✅ Check access grant from patient: `checkAccessLevel(patient, doctor, FULL)`
- ✅ Access must be ACTIVE (not revoked, not expired)
- ✅ Doctor must have FULL or SENSITIVE level

**Database & Blockchain Transaction:**

1. ✅ Create medical record in MongoDB
2. ✅ Store record data on blockchain via EHRManager
3. ✅ Link patient → medical record → doctor

**Response:**

```json
{
  "_id": "507f...",
  "patientId": "507f1f77bcf86cd799439011",
  "doctorId": "507f...",
  "examinationDate": "2026-04-08T14:30:00Z",
  "chief_complaint": "Headache for 3 days",
  "assessment": "Common tension headache",
  "status": "DRAFT",
  "txHash": "0xmedical123..."
}
```

**Database State:**

```javascript
// Medical Record Document
{
  _id: "507f...",
  patientId: "507f1f77bcf86cd799439011",
  doctorId: "507f...doctor",
  examinationDate: ISODate("2026-04-08T14:30:00Z"),
  chief_complaint: "Headache for 3 days",
  history_of_present_illness: "...",
  vital_signs: {...},
  physical_exam: {...},
  assessment: "Common tension headache",
  plan: "Prescribe Paracetamol...",
  status: "CREATED",
  txHash: "0xmedical123...",
  createdAt: ISODate("2026-04-08T14:30:00Z")
}
```

---

## 🧪 Step 4: Doctor Creates Lab Order

### 4.1 Doctor Orders Lab Tests

**Endpoint:** `POST /api/v1/lab-order/create`

**Authentication:** Doctor JWT Token

**Request:**

```json
{
  "patientId": "507f1f77bcf86cd799439011",
  "medicalRecordId": "507f...record",
  "testType": "BLOOD_TEST",
  "tests": [
    "FULL_BLOOD_COUNT",
    "BLOOD_GLUCOSE",
    "CHOLESTEROL_PANEL"
  ],
  "urgency": "ROUTINE",
  "notes": "Annual checkup - routine tests"
}
```

**Available Test Types:**

- `BLOOD_TEST` - Complete blood count, glucose, etc.
- `IMAGING` - X-ray, ultrasound, CT
- `ECG` - Electrocardiogram
- `URINALYSIS` - Urine tests
- `ENDOSCOPY` - Internal examination

**Backend Logic:**

1. ✅ Verify doctor has access to patient (checkAccessLevel)
2. ✅ Verify medical record exists
3. ✅ Assign to available lab tech
4. ✅ Create lab order record
5. ✅ Notify lab tech (push notification)

**Response:**

```json
{
  "_id": "507f...laborder",
  "patientId": "507f1f77bcf86cd799439011",
  "doctorId": "507f...doctor",
  "medicalRecordId": "507f...record",
  "testType": "BLOOD_TEST",
  "tests": ["FULL_BLOOD_COUNT", "BLOOD_GLUCOSE", "CHOLESTEROL_PANEL"],
  "status": "PENDING",
  "assignedLabTech": {
    "_id": "507f...labtech",
    "name": "Lab Tech Minh",
    "email": "labtech@hospital.com",
    "walletAddress": "0xf1d855b12714C2F3f81c6DECa3cC953D8A6cDD7f"
  },
  "createdAt": "2026-04-08T14:35:00Z"
}
```

**Blockchain State:**

```javascript
// Lab order stored on blockchain
EHRManager.getLabOrder(orderId)
→ {
  patientAddress: "0xED95a81E...",
  doctorAddress: "0x3C44CdDd...",
  testType: "BLOOD_TEST",
  status: "PENDING",
  createdAt: timestamp
}
```

---

## 🔬 Step 5: Lab Tech Receives & Processes Tests

### 5.1 Lab Tech Views Assigned Orders

**Endpoint:** `GET /api/v1/lab-order/assigned`

**Authentication:** Lab Tech JWT Token

**Response:**

```json
{
  "orders": [
    {
      "_id": "507f...laborder",
      "patientName": "Nguyen Van B",
      "doctorName": "Dr. Nguyen Van A",
      "testType": "BLOOD_TEST",
      "tests": ["FULL_BLOOD_COUNT", "BLOOD_GLUCOSE"],
      "status": "PENDING",
      "createdAt": "2026-04-08T14:35:00Z"
    }
  ]
}
```

### 5.2 Lab Tech Accepts Order

**Endpoint:** `POST /api/v1/lab-order/:orderId/accept`

**Authentication:** Lab Tech JWT Token

**Request:**

```json
{
  "labTechId": "507f...labtech"
}
```

**Response:**

```json
{
  "message": "Order accepted",
  "status": "IN_PROGRESS",
  "orderId": "507f...laborder"
}
```

**Database State:**

```javascript
// Lab Order Document
{
  status: "IN_PROGRESS",
  acceptedBy: "507f...labtech",
  acceptedAt: ISODate("2026-04-08T14:40:00Z")
}
```

### 5.3 Lab Tech Posts Test Results

**Endpoint:** `POST /api/v1/test-result/create`

**Authentication:** Lab Tech JWT Token

**Request:**

```json
{
  "labOrderId": "507f...laborder",
  "patientId": "507f1f77bcf86cd799439011",
  "testType": "BLOOD_TEST",
  "results": {
    "FULL_BLOOD_COUNT": {
      "WBC": { value: 7.2, unit: "10^9/L", normal_range: "4.5-11.0" },
      "RBC": { value: 4.8, unit: "10^12/L", normal_range: "4.5-5.5" },
      "HGB": { value: 14.2, unit: "g/dL", normal_range: "13.5-17.5" }
    },
    "BLOOD_GLUCOSE": {
      "fasting": { value: 95, unit: "mg/dL", normal_range: "70-100" }
    },
    "CHOLESTEROL_PANEL": {
      "total_cholesterol": { value: 185, unit: "mg/dL", normal_range: "<200" },
      "ldl": { value: 110, unit: "mg/dL", normal_range: "<100" }
    }
  },
  "notes": "All samples processed normally. Results within normal range.",
  "testDate": "2026-04-08T15:00:00Z"
}
```

**Backend Logic (Transaction Pattern):**

1. ✅ Verify lab tech has access to order
2. ✅ Validate test results format
3. ✅ Store results in MongoDB
4. ✅ Post results to blockchain via EHRManager
5. ✅ Link test result → lab order → medical record
6. ✅ Update lab order status to COMPLETED

**Response:**

```json
{
  "_id": "507f...testresult",
  "labOrderId": "507f...laborder",
  "patientId": "507f1f77bcf86cd799439011",
  "testType": "BLOOD_TEST",
  "results": {...},
  "status": "COMPLETED",
  "submittedAt": "2026-04-08T15:05:00Z",
  "txHash": "0xresult123..."
}
```

**Blockchain State:**

```javascript
// Test result stored on blockchain
EHRManager.getTestResult(resultId)
→ {
  labOrderId: "507f...",
  patientAddress: "0xED95a81E...",
  testType: "BLOOD_TEST",
  ipfsHash: "QmXxxx...",  // Results stored on IPFS
  submittedAt: timestamp,
  status: "COMPLETED"
}
```

---

## 👨‍⚕️ Step 6: Doctor Reviews Results & Finalizes

### 6.1 Doctor Retrieves Medical Record with Results

**Endpoint:** `GET /api/v1/medical-record/:recordId`

**Authentication:** Doctor JWT Token

**Doctor's Access Check:**

- ✅ Verify access grant from patient is ACTIVE
- ✅ Verify doctor created this medical record
- ✅ Retrieve associated lab orders and results

**Response:**

```json
{
  "_id": "507f...record",
  "patientId": "507f1f77bcf86cd799439011",
  "doctorId": "507f...doctor",
  "examinationDate": "2026-04-08T14:30:00Z",
  "chief_complaint": "Headache for 3 days",
  "assessment": "Common tension headache",
  "plan": "Prescribe Paracetamol...",
  "labOrders": [
    {
      "_id": "507f...laborder",
      "testType": "BLOOD_TEST",
      "status": "COMPLETED",
      "testResults": {
        "FULL_BLOOD_COUNT": {...},
        "BLOOD_GLUCOSE": {...},
        "CHOLESTEROL_PANEL": {...}
      },
      "completedAt": "2026-04-08T15:05:00Z"
    }
  ],
  "txHash": "0xmedical123..."
}
```

### 6.2 Doctor Updates Final Diagnosis

**Endpoint:** `PUT /api/v1/medical-record/:recordId/finalize`

**Authentication:** Doctor JWT Token

**Request:**

```json
{
  "finalDiagnosis": "Common tension headache with normal lab results",
  "finalPlan": [
    "Paracetamol 500mg twice daily for 3 days",
    "Rest and stress management",
    "Follow-up in 1 week if symptoms persist",
    "All lab tests within normal limits - no medication needed"
  ],
  "prescriptions": [
    {
      "medication": "Paracetamol",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "3 days"
    }
  ],
  "status": "COMPLETED"
}
```

**Backend Logic:**

1. ✅ Verify doctor has access to patient
2. ✅ Update all final fields
3. ✅ Set status to COMPLETED
4. ✅ Update blockchain with final state
5. ✅ Notify patient (push notification)
6. ✅ Create audit log

**Response:**

```json
{
  "_id": "507f...record",
  "status": "COMPLETED",
  "finalDiagnosis": "Common tension headache with normal lab results",
  "finalPlan": [...],
  "prescriptions": [...],
  "completedAt": "2026-04-08T15:10:00Z",
  "txHash": "0xfinal123..."
}
```

**Database State (Final):**

```javascript
// Medical Record - COMPLETED
{
  _id: "507f...record",
  patientId: "507f1f77bcf86cd799439011",
  doctorId: "507f...doctor",
  status: "COMPLETED",
  examinationDate: ISODate("2026-04-08T14:30:00Z"),
  completedAt: ISODate("2026-04-08T15:10:00Z"),
  chief_complaint: "Headache for 3 days",
  finalDiagnosis: "Common tension headache with normal lab results",
  finalPlan: [...],
  prescriptions: [...],
  txHash: "0xfinal123...",
  labOrders: ["507f...laborder"],
  testResults: ["507f...testresult"]
}

// Lab Order - COMPLETED
{
  _id: "507f...laborder",
  status: "COMPLETED",
  assignedLabTech: "507f...labtech",
  testResults: ["507f...testresult"]
}

// Test Result - SUBMITTED
{
  _id: "507f...testresult",
  status: "COMPLETED",
  results: {...},
  txHash: "0xresult123..."
}
```

### 6.3 Patient Reviews Results

**Endpoint:** `GET /api/v1/patient/medical-records`

**Authentication:** Patient JWT Token

**Response:**

```json
{
  "medicalRecords": [
    {
      "_id": "507f...record",
      "doctorName": "Dr. Nguyen Van A",
      "examinationDate": "2026-04-08T14:30:00Z",
      "completedAt": "2026-04-08T15:10:00Z",
      "status": "COMPLETED",
      "chief_complaint": "Headache for 3 days",
      "finalDiagnosis": "Common tension headache with normal lab results",
      "labTestsCount": 1,
      "prescriptionsCount": 1
    }
  ]
}
```

---

## 📊 Audit Trail & Blockchain Verification

### Summary of Blockchain Transactions

```javascript
// Blockchain event log for this workflow:

1. AccountManagerApproved(patient)
   → Patient moves to ACTIVE status
   TxHash: 0xabc123...

2. PatientRegistered(patient)
   → Patient registered as PATIENT role
   TxHash: 0xdef456...

3. AccessGranted(patient, doctor, FULL, unlimited)
   → Doctor can read patient records
   TxHash: 0xgrants123...

4. MedicalRecordCreated(patient, recordId, doctor)
   → Examination record stored
   TxHash: 0xmedical123...

5. LabOrderCreated(patient, orderId, doctor, tests)
   → Lab tests ordered
   TxHash: (implicit via lab order service)

6. TestResultSubmitted(patient, resultId, labTech, results)
   → Lab results posted
   TxHash: 0xresult123...

7. MedicalRecordFinalized(patient, recordId, finalDiagnosis)
   → Examination completed
   TxHash: 0xfinal123...
```

### Audit Logs Stored in MongoDB

```javascript
// Each action logged in auditLog collection
{
  userId: doctor_id,
  walletAddress: doctor_wallet,
  action: "CREATE_MEDICAL_RECORD",
  entityType: "MEDICAL_RECORD",
  entityId: record_id,
  txHash: tx_hash,
  status: "SUCCESS",
  timestamp: ISODate(...)
},
{
  userId: labtech_id,
  walletAddress: labtech_wallet,
  action: "SUBMIT_TEST_RESULT",
  entityType: "TEST_RESULT",
  entityId: result_id,
  txHash: tx_hash,
  status: "SUCCESS",
  timestamp: ISODate(...)
}
```

---

## 🔒 Permission & Access Control Summary

| Actor | Action | Requires | Verified |
|-------|--------|----------|----------|
| **Patient** | Register account | Email, Wallet | ✅ Wallet validation |
| **Admin** | Approve patient | Admin role | ✅ Role check |
| **Patient** | Grant access | Own wallet | ✅ JWT token ownership |
| **Doctor** | Access records | Valid grant | ✅ checkAccessLevel() |
| **Doctor** | Create medical record | Valid grant | ✅ Access control + ownership |
| **Doctor** | Create lab order | Valid grant | ✅ Access control + ownership |
| **Lab Tech** | Accept order | Assigned to order | ✅ Ownership check |
| **Lab Tech** | Submit results | Order accepted | ✅ Status check |
| **Doctor** | Finalize record | Created by doctor | ✅ Ownership check |
| **Patient** | View records | Created/shared with | ✅ Ownership check |

---

## ✅ Error Prevention Patterns Used

**1. Transaction Pattern** (Blockchain FIRST, DB second)

- All admin approvals
- Medical record creation
- Test result submission

**2. Auto-Revoke Pattern** (Check → Revoke → Grant)

- Patient grants access automatically revokes old grants

**3. Wallet Validation** (Required + Format + Unique)

- Patient registration requires valid wallet
- Wallet format validation using ethers.isAddress()

**4. Access Control Pattern** (Verify → Execute → Log)

- All doctor operations verify access grant first
- Lab tech ordered lab orders verified before access

---

## 📱 Frontend Flow Integration

### Patient Mobile App Flow

```
Home
  ↓
[Login] → Enter wallet address
  ↓
[Dashboard] → "Grant access to doctor"
  ↓
[Doctor List] → Select doctor
  ↓
[Grant Access Modal] → Confirm access
  ↓
[Medical Records] → View examination history
  ↓
[Record Detail] → View diagnosis & lab results
```

### Doctor App Flow

```
Home
  ↓
[Patients] → List of accessible patients
  ↓
[Create Examination] → Enter findings & diagnosis
  ↓
[Order Lab Tests] → Select test types
  ↓
[My Records] → Track examinations
  ↓
[View Lab Results] → See lab tech results
  ↓
[Finalize] → Complete medical record
```

### Lab Tech App Flow

```
Home
  ↓
[Assigned Orders] → List of lab orders
  ↓
[Accept Order] → Accept to process
  ↓
[Process Tests] → Run tests
  ↓
[Submit Results] → Upload results & findings
  ↓
[Completed] → Mark order complete
```

---

## 🧪 Testing This Workflow

### Prerequisites

```bash
# 1. Start blockchain (Hardhat/Sepolia)
# 2. Deploy contracts
# 3. Start backend: npm run dev
# 4. Have test wallets configured in .env.local
```

### Quick Test Script

```bash
# Run complete workflow test
node test-complete-flow.js

# Check blockchain health
curl http://localhost:3000/api/v1/health | jq '.blockchain'
```

### Manual Testing Steps

```bash
# 1. Patient registers
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@test.com",
    "password": "Test@123456",
    "nationId": "123456789012",
    "walletAddress": "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
  }'

# 2. Admin approves (requires admin token)
curl -X PATCH http://localhost:3000/api/v1/admins/users/USER_ID/approve \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# 3. Patient grants access (requires patient token)
curl -X POST http://localhost:3000/api/v1/access-control/grant \
  -H "Authorization: Bearer PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accessorAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "level": "FULL",
    "durationHours": 0
  }'

# ... and so on for each step
```

---

## 📞 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Patient reg fails | Invalid wallet format | Check format: 0x + 40 hex chars |
| Admin approve fails | Blockchain unavailable | Check RPC URL in .env.local |
| Grant access fails | Access already exists | Auto-revoke will handle it |
| Create record fails | No access grant | Verify access grant ACTIVE |
| Lab order fails | Lab tech not assigned | Check lab tech availability |
| Submit result fails | Order not accepted | Lab tech must accept first |

---

**Last Updated:** April 8, 2026  
**Version:** 1.0 (Complete Workflow)
