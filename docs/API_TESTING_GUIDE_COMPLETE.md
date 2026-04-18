# 🧪 Complete API Testing Guide - End-to-End Workflows

**Purpose:** Comprehensive guide to test all APIs with complete workflows from start to finish.

---

## 📋 Table of Contents

1. [Setup](#-setup) - Before you start testing
2. [WORKFLOW 1: Complete Lab Order Flow](#-workflow-1-complete-lab-order-flow) - Full end-to-end
3. [WORKFLOW 2: Patient Grants Access to Doctor](#-workflow-2-patient-grants-access-to-doctor) - Access control
4. [Individual API Reference](#-individual-api-reference) - All endpoints
5. [Error Scenarios](#-error-scenarios) - Testing failures

---

## ⚙️ Setup

### Prerequisites

```bash
# Install curl or use Postman
curl --version

# Base URL
BASE_URL="http://localhost:3000"

# Sample tokens (you'll need to generate these from login)
PATIENT_TOKEN="eyJhbGciOiJIUzI1NiIs..."
DOCTOR_TOKEN="eyJhbGciOiJIUzI1NiIs..."
LAB_TECH_TOKEN="eyJhbGciOiJIUzI1NiIs..."
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

### Setup Data

```bash
# IDs to use throughout tests
PATIENT_ID="507f1f77bcf86cd799439011"
PATIENT_ADDRESS="0xPATIENT111222333444555666"

DOCTOR_ID="507f1f77bcf86cd79943aaa1"
DOCTOR_ADDRESS="0xDOCTOR_MINH_AABBCCDDEEFF"

LAB_TECH_ID="507f1f77bcf86cd79943bbb2"
LAB_TECH_ADDRESS="0xLAB_TECH_001_AABBCCDD"

RECORD_ID="507f1f77bcf86cd799439999"
```

---

## 🔄 WORKFLOW 1: Complete Lab Order Flow

**Goal:** Test the entire journey from doctor creating order → patient consenting → lab posting results → doctor interpreting.

**Timeline:**

```
10:00 - Doctor creates lab order (status: ORDERED)
10:05 - Patient reviews & consents (status: CONSENTED)
14:30 - Lab tech posts results (status: RESULT_POSTED)
16:00 - Doctor interprets results (status: DOCTOR_REVIEWED)
```

---

### STEP 1: Doctor Creates Lab Order

**Endpoint:** `POST /v1/lab-orders`

**Request:**

```bash
curl -X POST http://localhost:3000/v1/lab-orders \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientAddress": "'"0xPATIENT111222333444555666"'",
    "patientId": "'"$PATIENT_ID"'",
    "recordType": "DIABETES_TEST",
    "testsRequested": [
      {
        "code": "GLUCOSE",
        "name": "Fasting Glucose",
        "group": "biochemistry",
        "urgent": false,
        "note": "Fasting sample"
      },
      {
        "code": "A1C",
        "name": "Hemoglobin A1C",
        "group": "biochemistry",
        "urgent": false,
        "note": "3-month average"
      },
      {
        "code": "CBC",
        "name": "Complete Blood Count",
        "group": "hematology",
        "urgent": false,
        "note": "Full count"
      }
    ],
    "priority": "normal",
    "clinicalNote": "Patient has symptoms of diabetes. Needs comprehensive test.",
    "sampleType": "blood",
    "diagnosisCode": "E11.9",
    "diagnosis": "Suspected Type 2 Diabetes"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439999",
    "patientId": "507f1f77bcf86cd799439011",
    "doctorId": "507f1f77bcf86cd79943aaa1",
    "recordType": "DIABETES_TEST",
    "status": "ORDERED",
    "testsRequested": [...],
    "orderHash": "0xabc123...",
    "blockchainTx": "0xtx123...",
    "createdAt": "2026-04-09T10:00:00Z"
  }
}
```

**What it does:**

- ✅ Creates lab order in MongoDB
- ✅ Computes orderHash locally
- ✅ Stores orderHash on blockchain
- ✅ Status set to ORDERED
- ✅ Patient NOT notified yet (waiting for consent)

**Save from response:**

```bash
LAB_ORDER_ID="507f1f77bcf86cd799439999"
ORDER_HASH="0xabc123..."
```

---

### STEP 2: Patient Reviews & Consents

**Endpoint:** `POST /v1/patients/lab-orders/{recordId}/consent`

**Request:**

```bash
curl -X POST http://localhost:3000/v1/patients/lab-orders/507f1f77bcf86cd799439999/consent \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "note": "I approve this lab order"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Consent recorded",
  "data": {
    "recordId": "507f1f77bcf86cd799439999",
    "status": "CONSENTED",
    "consentedAt": "2026-04-09T10:05:00Z",
    "consentTx": "0xtx456...",
    "auditLog": {
      "patient": "0xPATIENT111...",
      "action": "CONSENTED",
      "timestamp": 1712683500
    }
  }
}
```

**What it does:**

- ✅ Verifies patient ownership (blockchain check)
- ✅ Verifies status is ORDERED
- ✅ Updates status: ORDERED → CONSENTED on blockchain
- ✅ Emits PatientConsented event (audit trail)
- ✅ LOG: Now lab tech CAN post results

**Verify rejection scenario:**

```bash
# If patient rejects
curl -X POST http://localhost:3000/v1/patients/lab-orders/507f1f77bcf86cd799439999/consent \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved": false}'

# Response: Status stays ORDERED, lab tech cannot proceed
```

---

### STEP 3: Lab Tech Gets Pending Orders

**Endpoint:** `GET /v1/lab-techs/pending-orders`

**Request:**

```bash
curl -X GET http://localhost:3000/v1/lab-techs/pending-orders \
  -H "Authorization: Bearer $LAB_TECH_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439999",
      "patientId": "507f1f77bcf86cd799439011",
      "status": "CONSENTED",
      "testsRequested": ["GLUCOSE", "A1C", "CBC"],
      "priority": "normal",
      "createdAt": "2026-04-09T10:00:00Z",
      "consentedAt": "2026-04-09T10:05:00Z"
    }
  ]
}
```

**What it does:**

- ✅ Query MongoDB for orders with status CONSENTED
- ✅ Shows only orders PATIENT approved
- ✅ Lab tech knows: "Safe to process these orders"

---

### STEP 4: Lab Tech Posts First Test Result (GLUCOSE)

**Endpoint:** `POST /v1/lab-techs/test-results`

**Request:**

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medicalRecordId": "507f1f77bcf86cd799439999",
    "testType": "GLUCOSE",
    "rawData": {
      "glucose": "285 mg/dL",
      "unit": "mg/dL",
      "referenceRange": "70-100",
      "status": "HIGH",
      "timestamp": "2026-04-09T14:30:00Z",
      "method": "Enzymatic colorimetric"
    }
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "test_glucose_001",
    "medicalRecordId": "507f1f77bcf86cd799439999",
    "testType": "GLUCOSE",
    "rawData": {
      "glucose": "285 mg/dL"
    },
    "labResultHash": "0xlab456...",
    "blockchainTx": "0xtx789...",
    "onChain": true,
    "createdAt": "2026-04-09T14:30:00Z"
  }
}
```

**What it does:**

- ✅ Middleware verifies: status === CONSENTED (blocks if not consented!)
- ✅ Saves FULL data to MongoDB (glucose 285, all values)
- ✅ Computes labResultHash
- ✅ Posts hash on blockchain (NOT sensitive data)
- ✅ Updates status: CONSENTED → IN_PROGRESS

**Middleware check:**

```bash
# If status NOT CONSENTED, returns 403:
# {
#   "error": "Patient has not consented to this order"
# }
```

---

### STEP 5: Lab Tech Posts Additional Results (A1C, CBC)

**Request A1C:**

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medicalRecordId": "507f1f77bcf86cd799439999",
    "testType": "A1C",
    "rawData": {
      "a1c": "9.2%",
      "referenceRange": "< 5.7%",
      "status": "HIGH",
      "timestamp": "2026-04-09T14:35:00Z"
    }
  }'
```

**Request CBC:**

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medicalRecordId": "507f1f77bcf86cd799439999",
    "testType": "CBC",
    "rawData": {
      "wbc": "7.5 K/uL",
      "rbc": "4.8 M/uL",
      "hemoglobin": "14.2 g/dL",
      "hematocrit": "42%",
      "platelets": "250 K/uL"
    }
  }'
```

**After all results posted, status = RESULT_POSTED**

---

### STEP 6: Doctor Retrieves Results

**Endpoint:** `GET /v1/medical-records/{recordId}`

**Request:**

```bash
curl -X GET http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999 \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439999",
    "patientId": "507f1f77bcf86cd799439011",
    "diagnosis": "Suspected Type 2 Diabetes",
    "diagnosisCode": "E11.9",
    "status": "RESULT_POSTED",
    "testResults": [
      {
        "testType": "GLUCOSE",
        "value": "285 mg/dL",
        "status": "HIGH",
        "referenceRange": "70-100"
      },
      {
        "testType": "A1C",
        "value": "9.2%",
        "status": "HIGH",
        "referenceRange": "< 5.7%"
      },
      {
        "testType": "CBC",
        "values": {
          "wbc": "7.5 K/uL",
          "hemoglobin": "14.2 g/dL"
        }
      }
    ],
    "orderHash": "0xabc123...",
    "labResultHash": "0xlab456...",
    "createdAt": "2026-04-09T10:00:00Z"
  }
}
```

**What it does:**

- ✅ Verify doctor has access grant from patient (blockchain check)
- ✅ Return FULL test values (doctor can read everything)
- ✅ Include blockchain hashes for verification

---

### STEP 7: Doctor Updates Diagnosis (Optional)

**Endpoint:** `PATCH /v1/doctors/medical-records/{recordId}/diagnosis`

**Status:** ✅ **Fully documented in Swagger** (src/routes/v1/doctor.route.js)

**Request:**

```bash
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/507f1f77bcf86cd799439999/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "diagnosis": "Type 2 Diabetes Mellitus confirmed",
    "note": "Confirmed by lab results: glucose 285, A1C 9.2%"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Chẩn đoán hồ sơ bệnh án thành công",
  "diagnosis": "Type 2 Diabetes Mellitus confirmed",
  "status": "DIAGNOSED"
}
```

**What it does:**

- ✅ Update diagnosis in MongoDB (can edit anytime)
- ✅ NOT on blockchain (only for reference, stays mutable)
- ✅ Keep history of all changes (off-chain only, not immutable)
- ✅ Doctor can update multiple times before or after lab results

**Key Point:** Diagnosis is **MUTABLE** - can be changed anytime, based on exam findings  
**Difference vs Interpretation (STEP 8):**

- **Diagnosis** = Clinical observation from exam (may change as more data arrives)
- **Interpretation** = Final expert analysis of lab results (immutable once posted to blockchain)

---

### STEP 8: Doctor Posts Interpretation (FINAL - IMMUTABLE)

**Endpoint:** `PATCH /v1/lab-orders/{recordId}/interpretation`

**Status:** ✅ **Fully documented in Swagger** (src/routes/v1/labOrder.route.js)

**Request:**

```bash
curl -X PATCH http://localhost:3000/v1/lab-orders/507f1f77bcf86cd799439999/interpretation \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "interpretation": "Fasting glucose 285 mg/dL (normal < 100) indicates severe hyperglycemia. A1C 9.2% (normal < 5.7%) indicates poor glycemic control over past 3 months. Complete blood count values are within normal limits. Combined clinical picture with symptoms and lab results confirms Type 2 Diabetes Mellitus. Recommend: metformin therapy, dietary modification, exercise program. Follow-up in 2 weeks.",
    "recommendation": "1. Start metformin 500mg twice daily. 2. Dietary counseling. 3. Exercise 30 mins daily. 4. Follow-up HbA1c in 3 months."
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Thêm diễn giải lâm sàng thành công",
  "status": "DOCTOR_REVIEWED",
  "interpretationHash": "0xint789...",
  "txHash": "0xtx999..."
}
```

**What it does:**

- ✅ Verify status >= RESULT_POSTED (lab results must exist first)
- ✅ Save full text to MongoDB
- ✅ Compute interpretationHash (keccak256 of interpretation text)
- ✅ Post hash on blockchain (IMMUTABLE - becomes part of the record proof chain)
- ✅ Update status: RESULT_POSTED → DOCTOR_REVIEWED
- ✅ **CANNOT edit after this!** (frozen on blockchain forever)

**Key Difference from Diagnosis (STEP 7):**

- **Diagnosis:** Editable, offline (MongoDB only, can change anytime)
- **Interpretation:** Immutable, on-chain (posted to blockchain, frozen forever)

**Why different?**

- Diagnosis = Working notes (clinical observations, may be wrong)
- Interpretation = Final verdict (authoritative expert analysis, must be preserved)

---

### STEP 9: Verify Complete Record

**Endpoint:** `GET /v1/medical-records/{recordId}`

**Request:**

```bash
curl -X GET http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999 \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Response includes all 3 hashes (proof chain):**

```json
{
  "data": {
    "status": "DOCTOR_REVIEWED",
    "orderHash": "0xabc123...",          // Proof of order
    "labResultHash": "0xlab456...",      // Proof of results
    "interpretationHash": "0xint789...", // Proof of interpretation
    "testResults": [...full values...],
    "clinicalInterpretation": "...full text...",
    "timeline": {
      "orderedAt": "2026-04-09T10:00:00Z",
      "consentedAt": "2026-04-09T10:05:00Z",
      "labPostedAt": "2026-04-09T14:30:00Z",
      "doctorReviewedAt": "2026-04-09T16:00:00Z"
    }
  }
}
```

---

## 🔐 WORKFLOW 2: Patient Grants Access to Doctor

**Goal:** Test access control - patient grants/revokes access to doctor.

---

### STEP 1: Patient Grants Access to Doctor

**Endpoint:** `POST /v1/patients/access-grants`

**Request:**

```bash
curl -X POST http://localhost:3000/v1/patients/access-grants \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorAddress": "'"0xDOCTOR_MINH_AABBCCDDEEFF"'",
    "accessLevel": "FULL",
    "expiryDate": "2026-12-31",
    "reason": "Regular health checkup"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "grant_001",
    "patientAddress": "0xPATIENT111...",
    "doctorAddress": "0xDOCTOR_MINH...",
    "accessLevel": "FULL",
    "status": "active",
    "expiryDate": "2026-12-31",
    "grantedAt": "2026-04-09T09:00:00Z",
    "blockchainTx": "0xtx_grant_001"
  }
}
```

**What it does:**

- ✅ Stores grant in blockchain mapping
- ✅ Emits AccessGranted event
- ✅ Doctor can now read patient records

---

### STEP 2: Doctor Attempts to Read Patient Records

**Endpoint:** `GET /v1/doctors/patients/{patientId}/records`

**Request:**

```bash
curl -X GET http://localhost:3000/v1/doctors/patients/507f1f77bcf86cd799439011/records \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439999",
      "diagnosis": "Type 2 Diabetes",
      "testResults": [...],
      "clinicalInterpretation": "..."
    }
  ],
  "accessVerification": {
    "grantValid": true,
    "accessLevel": "FULL",
    "expiresAt": "2026-12-31"
  }
}
```

**What it does:**

- ✅ Query blockchain to verify access grant
- ✅ Return records if grant exists and is active
- ✅ Return 403 if no grant

---

### STEP 3: Doctor Without Access Tries to Read (Should Fail)

**Request (different doctor):**

```bash
# This doctor was NOT granted access
curl -X GET http://localhost:3000/v1/doctors/patients/507f1f77bcf86cd799439011/records \
  -H "Authorization: Bearer $OTHER_DOCTOR_TOKEN"
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "AccessDenied",
  "message": "Doctor does not have access to this patient's records"
}
```

---

### STEP 4: Patient Revokes Access

**Endpoint:** `DELETE /v1/patients/access-grants/{doctorAddress}`

**Request:**

```bash
curl -X DELETE http://localhost:3000/v1/patients/access-grants/0xDOCTOR_MINH_AABBCCDDEEFF \
  -H "Authorization: Bearer $PATIENT_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Access revoked",
  "data": {
    "doctorAddress": "0xDOCTOR_MINH...",
    "revokedAt": "2026-04-09T17:00:00Z",
    "blockchainTx": "0xtx_revoke_001"
  }
}
```

**What it does:**

- ✅ Updates blockchain grant to inactive
- ✅ Emits AccessRevoked event
- ✅ Doctor can NO LONGER access records

---

### STEP 5: Verify Access is Revoked

**Request:**

```bash
curl -X GET http://localhost:3000/v1/doctors/patients/507f1f77bcf86cd799439011/records \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "AccessRevoked",
  "message": "Your access to this patient's records has been revoked"
}
```

---

## 📚 Individual API Reference

### Authentication APIs

#### 1. Register Patient

```bash
POST /v1/auth/register-patient
{
  "email": "patient@example.com",
  "password": "securepass123",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "dateOfBirth": "1990-03-15"
}
```

#### 2. Register Doctor

```bash
POST /v1/auth/register-doctor
{
  "email": "doctor@example.com",
  "password": "securepass123",
  "fullName": "Dr. Minh",
  "phone": "0987654321",
  "specialization": "Cardiology",
  "licenseNumber": "MD12345"
}
```

#### 3. Login

```bash
POST /v1/auth/login
{
  "email": "patient@example.com",
  "password": "securepass123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "patient@example.com",
    "role": "PATIENT",
    "walletAddress": "0xPATIENT111..."
  }
}
```

### Lab Order APIs

#### 1. Create Lab Order

```bash
POST /v1/lab-orders
# See WORKFLOW 1 STEP 1
```

#### 2. Get Lab Order Details

```bash
GET /v1/lab-orders/{labOrderId}
-H "Authorization: Bearer $TOKEN"
```

#### 3. Get All Lab Orders (Patient)

```bash
GET /v1/lab-orders
-H "Authorization: Bearer $PATIENT_TOKEN"
```

### Test Result APIs

#### 1. Post Test Result

```bash
POST /v1/lab-techs/test-results
# See WORKFLOW 1 STEP 4-5
```

#### 2. Get Test Results for Record

```bash
GET /v1/test-results/{medicalRecordId}
-H "Authorization: Bearer $TOKEN"
```

### Diagnosis APIs

#### 1. Update Diagnosis

```bash
PATCH /v1/doctors/medical-records/{recordId}/diagnosis
# See WORKFLOW 1 STEP 7
```

#### 2. Get Diagnosis

```bash
GET /v1/doctors/medical-records/{recordId}/diagnosis
-H "Authorization: Bearer $DOCTOR_TOKEN"
```

### Interpretation APIs

#### 1. Post Interpretation

```bash
POST /v1/medical-records/{recordId}/interpretation
# See WORKFLOW 1 STEP 8
```

#### 2. Get Interpretation

```bash
GET /v1/medical-records/{recordId}/interpretation
-H "Authorization: Bearer $TOKEN"
```

### Patient Consent APIs

#### 1. Give Consent

```bash
POST /v1/patients/lab-orders/{recordId}/consent
# See WORKFLOW 1 STEP 2
```

#### 2. Get Consent Status

```bash
GET /v1/patients/lab-orders/{recordId}/consent
-H "Authorization: Bearer $PATIENT_TOKEN"
```

### Access Control APIs

#### 1. Grant Access

```bash
POST /v1/patients/access-grants
# See WORKFLOW 2 STEP 1
```

#### 2. List My Grants (Patient)

```bash
GET /v1/patients/access-grants
-H "Authorization: Bearer $PATIENT_TOKEN"
```

#### 3. Revoke Access

```bash
DELETE /v1/patients/access-grants/{doctorAddress}
# See WORKFLOW 2 STEP 4
```

#### 4. Get Granted Patients (Doctor)

```bash
GET /v1/doctors/granted-patients
-H "Authorization: Bearer $DOCTOR_TOKEN"
```

### Medical Record APIs

#### 1. Get Medical Record

```bash
GET /v1/medical-records/{recordId}
-H "Authorization: Bearer $TOKEN"
```

#### 2. Get All Medical Records (Doctor)

```bash
GET /v1/doctors/patients/{patientId}/records
-H "Authorization: Bearer $DOCTOR_TOKEN"
```

#### 3. Verify Record Integrity

```bash
GET /v1/medical-records/{recordId}/verify
-H "Authorization: Bearer $TOKEN"

Response:
{
  "recordId": "...",
  "verification": {
    "orderHash": {
      "stored": "0xabc123...",
      "computed": "0xabc123...",
      "match": true
    },
    "labResultHash": {
      "stored": "0xlab456...",
      "computed": "0xlab456...",
      "match": true
    },
    "interpretationHash": {
      "stored": "0xint789...",
      "computed": "0xint789...",
      "match": true
    },
    "tampering": false
  }
}
```

---

## ⚠️ Error Scenarios

### Scenario 1: Lab Tech Tries to Post Without Patient Consent

**Request:**

```bash
# Create order
curl -X POST http://localhost:3000/v1/lab-orders \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"patientId": "...", ...}'

# Lab tech tries to post results immediately (before patient consent)
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{
    "medicalRecordId": "...",
    "testType": "GLUCOSE",
    "rawData": {...}
  }'
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "CONSENT_REQUIRED",
  "message": "Patient must consent before lab can post results. Status: ORDERED (requires CONSENTED)"
}
```

---

### Scenario 2: Doctor Tries to Read Record Without Access Grant

**Request:**

```bash
curl -X GET http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999 \
  -H "Authorization: Bearer $DOCTOR_WITHOUT_ACCESS_TOKEN"
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "ACCESS_DENIED",
  "message": "You do not have permission to access this patient's record. Patient has not granted access."
}
```

---

### Scenario 3: Try to Edit Interpretation After Posted

**Request:**

```bash
# Try to patch interpretation (endpoint doesn't exist - interpretation is immutable)
curl -X PATCH http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999/interpretation \
  -d '{"interpretation": "New interpretation..."}'
```

**Expected Response (404 or 400):**

```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Cannot modify interpretation. It has been posted to blockchain and is immutable."
}
```

---

### Scenario 4: Doctor Tries to Post Interpretation Before Lab Results

**Request:**

```bash
curl -X POST http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999/interpretation \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"interpretation": "..."}'
```

**Expected Response (400):**

```json
{
  "success": false,
  "error": "INVALID_STATE",
  "message": "Cannot post interpretation. Lab results must be posted first. Current status: CONSENTED"
}
```

---

### Scenario 5: Invalid Token/Permission

**Request:**

```bash
curl -X POST http://localhost:3000/v1/lab-orders \
  -H "Authorization: Bearer invalid_token_here" \
  -d '{...}'
```

**Expected Response (401):**

```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token"
}
```

---

### Scenario 6: Lab Tech Accessing Doctor-Only API

**Request:**

```bash
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/507f1f77bcf86cd799439999/diagnosis \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{"diagnosis": "..."}'
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "ROLE_DENIED",
  "message": "Only doctors can update diagnosis. Your role: LAB_TECH"
}
```

---

## 🧪 Testing Checklist

### Lab Order Flow

- [ ] Doctor creates order (ORDERED status)
- [ ] Patient can see pending orders
- [ ] Patient consents (CONSENTED status)
- [ ] Lab tech sees ONLY consented orders
- [ ] Lab tech posts GLUCOSE results
- [ ] Middleware blocks posting if not CONSENTED
- [ ] Lab tech posts A1C results
- [ ] Lab tech posts CBC results
- [ ] Status becomes RESULT_POSTED
- [ ] Doctor can read all test values
- [ ] Doctor updates diagnosis
- [ ] Doctor posts interpretation (DOCTOR_REVIEWED)
- [ ] Hash integrity verified

### Access Control Flow

- [ ] Patient grants access to doctor
- [ ] Doctor can read patient records
- [ ] Other doctor CANNOT read records
- [ ] Patient revokes access
- [ ] Doctor cannot read anymore

### Error Cases

- [ ] Lab tech blocked without consent
- [ ] Doctor blocked without access grant
- [ ] Cannot edit interpretation
- [ ] Cannot interpret before results
- [ ] Invalid token rejected
- [ ] Role-based access enforced

---

## � How to Add Missing Endpoints to Postman

**These 2 endpoints are NOT auto-generated from Swagger (yet) but the code EXISTS and they WORK:**

### Endpoint 1: Update Diagnosis

Add manually to Postman:

```
Method: PATCH
URL: {{base_url}}/v1/doctors/medical-records/{{record_id}}/diagnosis
Authorization: Bearer {{doctor_token}}

Body (JSON):
{
  "diagnosis": "Type 2 Diabetes Mellitus confirmed",
  "diagnosisCode": "E11.9",
  "confirmedDiagnosis": "Type 2 Diabetes",
  "confidence": 95,
  "note": "Confirmed by lab results"
}
```

### Endpoint 2: Post Interpretation

Add manually to Postman:

```
Method: POST
URL: {{base_url}}/v1/medical-records/{{record_id}}/interpretation
Authorization: Bearer {{doctor_token}}

Body (JSON):
{
  "interpretation": "Fasting glucose 285 indicates severe hyperglycemia. A1C 9.2% indicates poor control. Confirms Type 2 Diabetes. Recommend metformin, dietary changes, exercise. Follow-up in 2 weeks."
}
```

**Why are they missing from Swagger?**

- Swagger decorators not added to route files yet
- Backend code exists and works fine
- Just need to add `@swagger` comments in:
  - `src/routes/v1/doctor.route.js` for diagnosis endpoint
  - `src/routes/v1/patientRecord.route.js` for interpretation endpoint

---

## �💾 Postman Collection

Save as `EHR_API_Tests.json`:

```bash
# Copy workflows above into Postman
# Set environment variables:
PATIENT_TOKEN, DOCTOR_TOKEN, LAB_TECH_TOKEN,
PATIENT_ID, DOCTOR_ID, LAB_TECH_ID
```

---

**Last Updated:** After patient consent requirement added  
**Status:** Complete end-to-end testing guide
