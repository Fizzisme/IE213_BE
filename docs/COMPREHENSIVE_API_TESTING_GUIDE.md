# 🧪 Complete API Testing Guide - From Registration to Completion

**Version:** 2.0  
**Purpose:** End-to-end testing từ đầu (user registration) đến cuối (record completion)  
**Last Updated:** 2026-04-09

---

## 📋 Complete Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMPLETE TEST FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ PHASE 0: Setup Environment                                      │
│   └─ Check server running, MongoDB, Blockchain                 │
│                                                                 │
│ PHASE 1: User Registration & Authentication                     │
│   ├─ Register Patient                                           │
│   ├─ Register Doctor                                            │
│   ├─ Register Lab Tech                                          │
│   └─ Get Tokens for All Users                                  │
│                                                                 │
│ PHASE 2: Medical Record Creation                               │
│   ├─ Doctor creates Medical Record (clinical examination)       │
│   ├─ Stores vitals, physical exam, assessment, plan             │
│   ├─ ⏩ Diagnosis comes AFTER lab results                       │
│   └─ Verify 1 ACTIVE record constraint                         │
│                                                                 │
│ PHASE 3: Lab Order Creation                                    │
│   ├─ Doctor creates Lab Order                                  │
│   ├─ Verify status = ORDERED                                   │
│   └─ Generate order hash                                       │
│                                                                 │
│ PHASE 4: Patient Consent                                       │
│   ├─ Patient reviews order                                     │
│   ├─ Patient consents (status → CONSENTED)                     │
│   └─ Verify blockchain event                                   │
│                                                                 │
│ PHASE 5: Lab Operations                                        │
│   ├─ Lab tech gets pending orders                              │
│   ├─ Lab tech posts test results                               │
│   ├─ Multiple results (GLUCOSE, A1C, CBC)                      │
│   ├─ Status → RESULT_POSTED                                    │
│   └─ Verify lab result hashes                                  │
│                                                                 │
│ PHASE 6: Doctor Diagnosis & Interpretation                      │
│   ├─ Doctor updates diagnosis (OFF-CHAIN, mutable)             │
│   ├─ Doctor posts interpretation (ON-CHAIN, immutable)         │
│   ├─ Status → DOCTOR_REVIEWED                                  │
│   └─ Verify interpretation hash                                │
│                                                                 │
│ PHASE 7: Access Control & Blockchain Verification              │
│   ├─ Patient grants access to doctor                           │
│   ├─ Doctor reads full record                                  │
│   ├─ Verify blockchain event logs                              │
│   └─ Patient revokes access                                    │
│                                                                 │
│ PHASE 8: Admin Operations                                      │
│   ├─ Admin approves/rejects users                              │
│   ├─ Admin manages blockchain access                           │
│   └─ Admin views audit logs                                    │
│                                                                 │
│ PHASE 9: Verification & Edge Cases                             │
│   ├─ Verify record integrity (hash matching)                   │
│   ├─ Test error scenarios                                      │
│   ├─ Test permission boundaries                                │
│   └─ Test blockchain immutability                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# ⚙️ PHASE 0: Environment Setup

## Check Server Running

```bash
curl -X GET http://localhost:3000/health
```

**Expected Response (200):**

```json
{
  "status": "OK",
  "server": "Running",
  "database": "Connected",
  "blockchain": "Connected"
}
```

## Check Database Connection

```bash
# Test MongoDB connectivity
curl -X GET http://localhost:3000/api/health/database
```

## Check Blockchain Connection

```bash
# Test blockchain connection (Sepolia testnet)
curl -X GET http://localhost:3000/api/health/blockchain
```

**Expected:**

```json
{
  "network": "Sepolia Testnet",
  "connected": true,
  "contracts": {
    "AccessControl": "0x5dBf1bCa9a1e1846d3d8F0ffF8f7a6D80FCC0EFd",
    "AccountManager": "0x4738a25bD1e5a3D4B3AeB3Fcb7aB5feb9562560f",
    "EHRManager": "0xE9BcB45A69EdFdE584Fbe8B3BB7dD2281634F239"
  }
}
```

---

# 🔐 PHASE 1: User Registration & Authentication

## Step 1.1: Register Patient Account

**Endpoint:** `POST /v1/auth/register/patient`

```bash
curl -X POST http://localhost:3000/v1/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@hospital.com",
    "password": "PatientPass@123",
    "nationId": "123456789012",
    "fullName": "Nguyễn Văn Bệnh Nhân",
    "phone": "0908000001",
    "dateOfBirth": "1990-01-15",
    "gender": "Male",
    "address": "123 Nguyen Hue, Hanoi"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "_id": "665a1234567890abcd12345",
    "email": "patient@hospital.com",
    "nationId": "123456789012",
    "role": "PATIENT",
    "status": "PENDING_APPROVAL",
    "createdAt": "2026-04-09T10:00:00Z"
  }
}
```

**Save for later:**

```bash
PATIENT_ID="665a1234567890abcd12345"
PATIENT_EMAIL="patient@hospital.com"
```

---

## Step 1.2: Register Doctor Account

**Endpoint:** `POST /v1/auth/register/doctor`

```bash
curl -X POST http://localhost:3000/v1/auth/register/doctor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@hospital.com",
    "password": "DoctorPass@123",
    "fullName": "Dr. Trần Minh Đức",
    "phone": "0908000002",
    "specialization": "Cardiology",
    "licenseNumber": "MD202400001",
    "hospitalAffiliation": "Central Hospital",
    "yearsOfExperience": 15
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Doctor registration successful",
  "data": {
    "_id": "665a1234567890abcd12346",
    "email": "doctor@hospital.com",
    "role": "DOCTOR",
    "status": "PENDING_APPROVAL",
    "specialization": "Cardiology",
    "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "createdAt": "2026-04-09T10:01:00Z"
  }
}
```

**Save for later:**

```bash
DOCTOR_ID="665a1234567890abcd12346"
DOCTOR_EMAIL="doctor@hospital.com"
DOCTOR_WALLET="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
```

---

## Step 1.3: Register Lab Tech Account

**Endpoint:** `POST /v1/auth/register/lab-tech`

```bash
curl -X POST http://localhost:3000/v1/auth/register/lab-tech \
  -H "Content-Type: application/json" \
  -d '{
    "email": "labtech@hospital.com",
    "password": "LabTechPass@123",
    "fullName": "Lê Thị Xét Nghiệm",
    "phone": "0908000003",
    "certification": "ISO15189",
    "hospitalAffiliation": "Central Hospital",
    "yearsOfExperience": 8
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Lab tech registration successful",
  "data": {
    "_id": "665a1234567890abcd12347",
    "email": "labtech@hospital.com",
    "role": "LAB_TECH",
    "status": "PENDING_APPROVAL",
    "walletAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "createdAt": "2026-04-09T10:02:00Z"
  }
}
```

**Save for later:**

```bash
LAB_TECH_ID="665a1234567890abcd12347"
LAB_TECH_EMAIL="labtech@hospital.com"
LAB_TECH_WALLET="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
```

---

## Step 1.4: (ADMIN ONLY) Approve New Users

**Endpoint:** `POST /v1/admins/users/{userId}/approve`

The admin needs to approve registered users before they can login. This is done by admin in the system.

```bash
# Admin approves patient
curl -X POST http://localhost:3000/v1/admins/users/665a1234567890abcd12345/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Approved for lab testing"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "User approved successfully",
  "data": {
    "_id": "665a1234567890abcd12345",
    "status": "ACTIVE",
    "approvedAt": "2026-04-09T10:05:00Z",
    "approvedBy": "admin_user_id"
  }
}
```

Repeat for DOCTOR and LAB_TECH:

```bash
# Approve doctor
curl -X POST http://localhost:3000/v1/admins/users/665a1234567890abcd12346/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"note": "Approved"}'

# Approve lab tech
curl -X POST http://localhost:3000/v1/admins/users/665a1234567890abcd12347/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"note": "Approved"}'
```

---

## Step 1.5: Login and Get Tokens

### Patient Login

**Endpoint:** `POST /v1/auth/login/nationId`

```bash
curl -X POST http://localhost:3000/v1/auth/login/nationId \
  -H "Content-Type: application/json" \
  -d '{
    "nationId": "123456789012",
    "password": "PatientPass@123"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "665a1234567890abcd12345",
    "email": "patient@hospital.com",
    "role": "PATIENT",
    "status": "ACTIVE",
    "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  }
}
```

**Save token:**

```bash
PATIENT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
PATIENT_WALLET="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
```

### Doctor Login (MetaMask Wallet)

**Endpoint:** `POST /v1/auth/login/wallet`

Doctor uses MetaMask to login. First, get login message:

```bash
# Get login message
curl -X POST http://localhost:3000/v1/auth/wallet/login/message \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  }'
```

**Response:**

```json
{
  "message": "Sign this message to login to EHR: 1712745600",
  "nonce": "1712745600"
}
```

Then sign message with MetaMask and submit:

```bash
# After signing with MetaMask private key
curl -X POST http://localhost:3000/v1/auth/wallet/login \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "signature": "0x1234...abcd",
    "message": "Sign this message to login to EHR: 1712745600"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "665a1234567890abcd12346",
    "email": "doctor@hospital.com",
    "role": "DOCTOR",
    "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  }
}
```

**Save token:**

```bash
DOCTOR_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
DOCTOR_WALLET="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
```

### Lab Tech Login (MetaMask Wallet)

```bash
# Get message
curl -X POST http://localhost:3000/v1/auth/wallet/login/message \
  -d '{"walletAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'

# Sign and login (same flow as doctor)
curl -X POST http://localhost:3000/v1/auth/wallet/login \
  -d '{
    "walletAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "signature": "0x...",
    "message": "..."
  }'
```

**Save token:**

```bash
LAB_TECH_TOKEN="..."
LAB_TECH_WALLET="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
```

---

# 📋 PHASE 2: Medical Record Creation

⚠️ **CRITICAL WORKFLOW ORDER (from code validation):**

| Step | Action | Status | Has testResultId? |
|------|--------|--------|-------------------|
| **1️⃣** | Doctor examines patient → Creates medical record with vitals, exam findings | `CREATED` | ❌ NO |
| **2️⃣** | Doctor creates lab order (requesting tests) | `ORDERED` | ❌ NO |
| **3️⃣** | Patient consents to lab tests | `CONSENTED` | ❌ NO |
| **4️⃣** | **Lab tech posts test results** | `RESULT_POSTED` | ✅ **YES!** |
| **5️⃣** | **NOW doctor can add diagnosis** (uses testResultId from step 4) | `DIAGNOSED` | ✅ YES |

❌ **CANNOT do diagnosis before lab results** (validation requires `testResultId`)  
✅ **Diagnosis = Clinical interpretation of test results**

---

## Step 2.1: Doctor Creates Medical Record (Clinical Examination)

**Endpoint:** `POST /v1/doctors/patients/{patientId}/medical-records`

Doctor creates a medical record during patient examination, storing all clinical findings immediately.

**Required Fields:**

- `chief_complaint` (string, 5-1000 chars): Main presenting symptoms
- `vital_signs` (object): Must include `temperature` (required), others optional:
  - `temperature` (number): Body temperature in Celsius
  - `blood_pressure` (string): e.g., "120/80"
  - `heart_rate` (number): Beats per minute
  - `respiratory_rate` (number): Breaths per minute
  - `oxygen_saturation` (number): SpO2 percentage

**Optional Fields:**

- `physical_exam` (object): Physical examination findings
  - `general`, `head_neck`, `chest`, `abdomen`, `extremities` (all string)
- `assessment` (string, max 1000 chars): Initial clinical assessment
- `plan` (array of strings): Treatment plan/next steps

```bash
curl -X POST http://localhost:3000/v1/doctors/patients/665a1234567890abcd12345/medical-records \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chief_complaint": "Đau đầu, sốt cao 39 độ",
    "vital_signs": {
      "temperature": 38.5,
      "blood_pressure": "120/80",
      "heart_rate": 72,
      "respiratory_rate": 16,
      "oxygen_saturation": 98
    },
    "physical_exam": {
      "general": "Tình trạng chung: tỉnh táo, hợp tác",
      "head_neck": "Đầu: bình thường",
      "chest": "Ngực: phổi sạch",
      "abdomen": "Bụng: mềm, không đau",
      "extremities": "Tứ chi: bình thường"
    },
    "assessment": "Chẩn đoán lâm sàng ban đầu: Cảm cúm",
    "plan": [
      "Kê đơn thuốc hạ sốt",
      "Xét nghiệm máu",
      "Tái khám sau 3 ngày"
    ]
  }'
```

**Expected Response (201):**

```json
{
  "medicalRecordId": "69cef1a2b3c4d5e6f7890123",
  "status": "CREATED",
  "chief_complaint": "Đau đầu, sốt cao 39 độ",
  "message": "Tạo hồ sơ bệnh án thành công"
}
```

**Save for later:**

```bash
MEDICAL_RECORD_ID="69cef1a2b3c4d5e6f7890123"
```

✅ **Status = CREATED - Medical record with full clinical data stored!**

---

## Step 2.2: ⏩ SKIP THIS STEP FOR NOW

**Why?** The diagnosis endpoint REQUIRES test results to exist first (needs `testResultId`).

The actual workflow is:

1. ✅ Create medical record (you are here - with examination findings)
2. → Jump to PHASE 3: Create lab order (to run requested tests)
3. → PHASE 4-5: Get lab results  
4. → Then come back and add diagnosis (Step 6 below)

---

## Step 2.3: Verify 1 ACTIVE Record Per Patient Constraint

---

## Step 2.3: Verify 1 ACTIVE Record Per Patient Constraint

Try to create another medical record while one is ACTIVE:

```bash
curl -X POST http://localhost:3000/v1/doctors/patients/665a1234567890abcd12345/medical-records \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "type": "FOLLOW_UP",
    "note": "Follow-up visit"
  }'
```

**Expected Response (400) - Should FAIL:**

```json
{
  "success": false,
  "error": "ACTIVE_RECORD_EXISTS",
  "message": "Patient already has an active medical record (ID: 665a2000000000000000001). Please complete the current record before creating a new one."
}
```

✅ **This constraint ensures 1 ACTIVE record per patient at a time!**

---

# 💊 PHASE 3: Lab Order Creation

## Step 3.1: Doctor Creates Lab Order

**Endpoint:** `POST /v1/lab-orders`

```bash
curl -X POST http://localhost:3000/v1/lab-orders \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "665a1234567890abcd12345",
    "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "medicalRecordId": "665a2000000000000000001",
    "recordType": "CARDIAC_WORKUP",
    "priority": "HIGH",
    "clinicalNote": "Rule out myocardial infarction. Patient with chest pain and dyspnea.",
    "diagnosisCode": "R06.02",
    "diagnosis": "Shortness of breath - dyspnea",
    "testsRequested": [
      {
        "code": "TROPONIN",
        "name": "Troponin I (high-sensitivity)",
        "group": "cardiac",
        "urgent": true,
        "note": "Rule out MI"
      },
      {
        "code": "BNP",
        "name": "B-type Natriuretic Peptide",
        "group": "cardiac",
        "urgent": true,
        "note": "Heart failure assessment"
      },
      {
        "code": "CBC",
        "name": "Complete Blood Count",
        "group": "hematology",
        "urgent": false,
        "note": "Full count"
      },
      {
        "code": "CMP",
        "name": "Comprehensive Metabolic Panel",
        "group": "biochemistry",
        "urgent": false,
        "note": "Electrolytes, renal function"
      }
    ],
    "sampleType": "blood",
    "collectionInstructions": "Fasting not required. Stat collection."
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "665a3000000000000000001",
    "patientId": "665a1234567890abcd12345",
    "doctorId": "665a1234567890abcd12346",
    "medicalRecordId": "665a2000000000000000001",
    "status": "ORDERED",
    "priority": "HIGH",
    "testsRequested": [
      {"code": "TROPONIN", "name": "Troponin I (high-sensitivity)"},
      ...
    ],
    "orderHash": "0xorder123...",
    "blockchainTx": "0xtx_order_001",
    "createdAt": "2026-04-09T10:45:00Z"
  }
}
```

**Save for later:**

```bash
LAB_ORDER_ID="665a3000000000000000001"
ORDER_HASH="0xorder123..."
```

## Step 3.2: Verify Status = ORDERED

```bash
curl -X GET http://localhost:3000/v1/lab-orders/$LAB_ORDER_ID \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Response shows:**

- ✅ Status: `ORDERED`
- ✅ Patient NOT notified yet
- ✅ Lab tech CANNOT post results yet (waiting for consent)

---

# ✅ PHASE 4: Patient Consent

## Step 4.1: Patient Views Pending Orders

**Endpoint:** `GET /v1/patients/lab-orders`

Patient checks what lab orders are waiting for consent.

```bash
curl -X GET http://localhost:3000/v1/patients/lab-orders \
  -H "Authorization: Bearer $PATIENT_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "_id": "665a3000000000000000001",
      "medicalRecordId": "665a2000000000000000001",
      "doctorId": "665a1234567890abcd12346",
      "status": "ORDERED",
      "priority": "HIGH",
      "diagnosis": "Shortness of breath - dyspnea",
      "testsRequested": [
        {"code": "TROPONIN", "name": "Troponin I (high-sensitivity)", "urgent": true},
        ...
      ],
      "clinicalNote": "Rule out myocardial infarction. Patient with chest pain and dyspnea.",
      "createdAt": "2026-04-09T10:45:00Z"
    }
  ]
}
```

## Step 4.2: Patient Consents to Lab Order

**Endpoint:** `POST /v1/patients/lab-orders/{labOrderId}/consent`

Patient approves the lab order. This is critical - lab tech can ONLY post results after consent.

```bash
curl -X POST http://localhost:3000/v1/patients/lab-orders/665a3000000000000000001/consent \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "note": "I consent to these lab tests"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Consent recorded successfully",
  "data": {
    "labOrderId": "665a3000000000000000001",
    "status": "CONSENTED",
    "consentedAt": "2026-04-09T11:00:00Z",
    "consentBy": "665a1234567890abcd12345",
    "blockchainTx": "0xtx_consent_001",
    "auditLog": {
      "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "action": "CONSENTED",
      "timestamp": 1712745600
    }
  }
}
```

✅ **Now Status = CONSENTED - Lab tech CAN post results**

## Step 4.3: (Alternative) Patient Rejects Order

```bash
curl -X POST http://localhost:3000/v1/patients/lab-orders/665a3000000000000000001/consent \
  -d '{
    "approved": false,
    "note": "I do not want these tests"
  }'
```

**Expected Response (200):**

```json
{
  "success": true,
  "status": "REJECTED",
  "message": "Lab order rejected by patient",
  "blockchainTx": "0xtx_reject_001"
}
```

❌ **Status = REJECTED - Lab tech CANNOT post results**

---

# 🧬 PHASE 5: Lab Operations

## Step 5.1: Lab Tech Gets Pending Orders

**Endpoint:** `GET /v1/lab-techs/pending-orders`

Lab tech sees only orders that patient has CONSENTED to.

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
      "_id": "665a3000000000000000001",
      "patientId": "665a1234567890abcd12345",
      "status": "CONSENTED",
      "priority": "HIGH",
      "diagnosis": "Shortness of breath - dyspnea",
      "testsRequested": ["TROPONIN", "BNP", "CBC", "CMP"],
      "consentedAt": "2026-04-09T11:00:00Z",
      "collectionInstructions": "Fasting not required. Stat collection."
    }
  ]
}
```

✅ **Lab tech sees ONLY consented orders**

## Step 5.2: Lab Tech Posts First Test Result (TROPONIN - STAT)

**Endpoint:** `POST /v1/lab-techs/test-results`

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medicalRecordId": "665a2000000000000000001",
    "labOrderId": "665a3000000000000000001",
    "testType": "TROPONIN",
    "analyzerName": "Abbott STAT High Sensitive Troponin",
    "methodUsed": "Immunoassay",
    "rawData": {
      "value": "0.02",
      "unit": "ng/mL",
      "referenceRange": "< 0.03",
      "status": "NORMAL",
      "timestamp": "2026-04-09T11:15:00Z",
      "measurementTime": "2.5 hours from admission"
    },
    "interpretation": "Troponin negative, MI ruled out at this time"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "test_troponin_001",
    "medicalRecordId": "665a2000000000000000001",
    "testType": "TROPONIN",
    "result": 0.02,
    "unit": "ng/mL",
    "status": "NORMAL",
    "labResultHash": "0xlab_troponin_xyz",
    "blockchainTx": "0xtx_result_troponin_001",
    "onChain": true,
    "createdAt": "2026-04-09T11:15:00Z"
  }
}
```

**Save for later:**

```bash
TROPONIN_RESULT_ID="test_troponin_001"
```

## Step 5.3: Lab Tech Posts Second Test (BNP)

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{
    "medicalRecordId": "665a2000000000000000001",
    "labOrderId": "665a3000000000000000001",
    "testType": "BNP",
    "rawData": {
      "value": "350",
      "unit": "pg/mL",
      "referenceRange": "< 100",
      "status": "ELEVATED",
      "timestamp": "2026-04-09T11:20:00Z"
    },
    "interpretation": "Elevated BNP suggests heart failure"
  }'
```

**Expected Response (201):**

- Status updated to `IN_PROGRESS` (at least 1 result posted)
- BNP hash stored on blockchain

## Step 5.4: Lab Tech Posts Remaining Tests (CBC, CMP)

```bash
# Post CBC results
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{
    "medicalRecordId": "665a2000000000000000001",
    "labOrderId": "665a3000000000000000001",
    "testType": "CBC",
    "rawData": {
      "wbc": "7.2",
      "rbc": "4.8",
      "hemoglobin": "14.5",
      "hematocrit": "43%",
      "platelets": "250",
      "status": "NORMAL"
    }
  }'

# Post CMP results
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{
    "medicalRecordId": "665a2000000000000000001",
    "labOrderId": "665a3000000000000000001",
    "testType": "CMP",
    "rawData": {
      "sodium": "138",
      "potassium": "4.2",
      "chloride": "102",
      "glucose": "95",
      "bun": "18",
      "creatinine": "0.9",
      "status": "NORMAL"
    }
  }'
```

## Step 5.5: Verify Status = RESULT_POSTED

```bash
curl -X GET http://localhost:3000/v1/lab-orders/$LAB_ORDER_ID \
  -H "Authorization: Bearer $LAB_TECH_TOKEN"
```

**Expected Response:**

```json
{
  "status": "RESULT_POSTED",
  "testResults": [
    {"testType": "TROPONIN", "value": "0.02", "unit": "ng/mL", "status": "NORMAL"},
    {"testType": "BNP", "value": "350", "unit": "pg/mL", "status": "ELEVATED"},
    {"testType": "CBC", "hemoglobin": "14.5", "status": "NORMAL"},
    {"testType": "CMP", "glucose": "95", "status": "NORMAL"}
  ],
  "allTestsPosted": true,
  "medicalRecord": {
    "status": "RESULT_POSTED"
  }
}
```

---

# 🔍 PHASE 6: Doctor Diagnosis & Interpretation

## Step 6.1: ✅ NOW ADD DIAGNOSIS (After Lab Results Exist!)

**Endpoint:** `PATCH /v1/doctors/medical-records/{medicalRecordId}/diagnosis`

⚠️ **IMPORTANT: This endpoint ONLY works AFTER lab results are posted!**

Lab results must exist and have been saved to database. The diagnosis is a clinical interpretation of those results.

**Required Fields:**

- **`testResultId` (string) - MANDATORY!** This MUST be the ID from a test result that was already posted by lab tech in PHASE 5
- `diagnosis` (string, 1-1000 chars): Diagnosis interpretation based on those test results

**Optional Fields:**

- `note` (string, max 500 chars): Additional clinical notes

```bash
# ❌ WRONG - testResultId doesn't exist yet
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/69cef1a2b3c4d5e6f7890123/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"testResultId": "fake_id", "diagnosis": "..."}'
# Result: 404 NOT FOUND

# ✅ CORRECT - Use actual testResultId from PHASE 5
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/69cef1a2b3c4d5e6f7890123/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "testResultId": "69d5a9b4c7d8e2f1a3c5b7e9",
    "diagnosis": "Type 2 Diabetes Mellitus - Glucose 285 mg/dL (normal 70-100). HbA1c 8.2% indicates average glucose > 200 mg/dL over 3 months.",
    "note": "Patient requires lifestyle modification and metformin initiation"
  }'
```

**Expected Response (200):**

```json
{
  "message": "Chẩn đoán hồ sơ bệnh án thành công",
  "diagnosis": "Type 2 Diabetes Mellitus - test-based",
  "status": "DIAGNOSED"
}
```

✅ **Status updated from CREATED → DIAGNOSED (with test result basis!)**

---

## Step 6.1b: ⚠️ Troubleshooting - What If Diagnosis Fails?

### ❌ Error: Missing testResultId

**Request:**

```bash
# WRONG - forgot testResultId
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/69cef1a2b3c4d5e6f7890123/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"diagnosis": "..."}'
```

**Response (422 or 400):**

```json
{
  "error": "Validation failed",
  "details": "testResultId is required"
}
```

**Why?** The validation schema requires `testResultId: z.string()` with NO `.optional()`. This is intentional - diagnosis MUST be based on actual lab results.

**Fix:** Get `testResultId` from PHASE 5 response, then include it in request.

### ❌ Error: Invalid testResultId

**Request:**

```bash
# WRONG - testResultId that doesn't exist
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/69cef1a2b3c4d5e6f7890123/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "testResultId": "999999999999999999999999",
    "diagnosis": "..."
  }'
```

**Response (404):**

```json
{
  "error": "Test result not found"
}
```

**Why?** The endpoint verifies that testResultId actually exists in database before allowing diagnosis.

**Fix:** Use the exact testResultId returned by lab tech in PHASE 5.2.

### ❌ Error: Medical Record ID is Invalid

**Request:**

```bash
# WRONG - invalid medical record ID format
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/invalid_id/diagnosis \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "testResultId": "69d5a9b4c7d8e2f1a3c5b7e9",
    "diagnosis": "..."
  }'
```

**Response (400):**

```json
{
  "error": "Invalid ObjectId"
}
```

**Why?** Medical record ID must be valid MongoDB ObjectId format (24-character hex string).

**Fix:** Use the exact medicalRecordId from PHASE 2.1 response.

---

## Step 6.2: Doctor Retrieves Complete Record with Results

**Endpoint:** `GET /v1/medical-records/{recordId}`

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001 \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response (200) - FULL RECORD:**

```json
{
  "success": true,
  "data": {
    "_id": "665a2000000000000000001",
    "patientId": "665a1234567890abcd12345",
    "status": "DIAGNOSED",
    "createdBy": "665a1234567890abcd12346",
    "type": "DIABETES_TEST",
    "diagnosis": "Type 2 Diabetes based on glucose 285 mg/dL",
    "testResults": [
      {"testType": "GLUCOSE", "value": 285, "unit": "mg/dL", "status": "HIGH"},
      {"testType": "A1C", "value": 8.2, "unit": "%", "status": "HIGH"}
    ],
    "timeline": {
      "createdAt": "2026-04-09T10:30:00Z",
      "diagnosedAt": "2026-04-09T11:35:00Z"
    }
  }
}
```

✅ **Record now has diagnosis based on test results!**

---

## Step 6.3: Doctor Posts Final Interpretation (ON-CHAIN, IMMUTABLE)

**Endpoint:** `POST /v1/medical-records/{recordId}/interpretation`

Doctor provides final expert analysis and posts it on blockchain. Once posted, it becomes IMMUTABLE forever.

```bash
curl -X POST http://localhost:3000/v1/medical-records/665a2000000000000000001/interpretation \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "interpretation": "CLINICAL ASSESSMENT:\nPatient presents with acute dyspnea and fatigue. Cardiac workup performed to rule out acute coronary syndrome.\n\nLAB INTERPRETATION:\n- Troponin I (hsTn): 0.02 ng/mL (NORMAL, <0.03) - Negative for myocardial infarction at presentation\n- BNP: 350 pg/mL (ELEVATED, normal <100) - Consistent with heart failure\n- CBC: All values normal - No acute infection or anemia\n- CMP: Glucose 95, electrolytes normal - Renal function adequate\n\nDIAGNOSIS: Acute heart failure, NYHA Class II-III, etiology likely hypertensive. Rule out valvular disease.\n\nRECOMMENDATIONS:\n1. Admit for observation and diuretic therapy\n2. Continue ACE inhibitor (lisinopril 10mg daily)\n3. Start furosemide 20mg IV for acute decompensation\n4. Echocardiography to assess cardiac function and rule out valvular disease\n5. Repeat BNP in 24 hours\n6. Strict fluid restriction (1.5L/day)\n7. Daily weight monitoring\n8. Follow-up with cardiology in 1 week post-discharge\n\nPROGNOSIS: Good with appropriate treatment. Patient should show improvement within 48-72 hours of diuretic therapy.",
    "recommendation": "Patient requires hospitalization. Diuretic therapy + cardiac imaging needed.",
    "prognosis": "Good with appropriate treatment",
    "followUpPlan": "Repeat BNP in 24 hours, echo imaging, cardiology follow-up"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Interpretation posted successfully (IMMUTABLE)",
  "data": {
    "_id": "665a2000000000000000001",
    "status": "DOCTOR_REVIEWED",
    "interpretationHash": "0xint456...",
    "blockchainTx": "0xtx_interpretation_001",
    "interpretationPostedAt": "2026-04-09T12:30:00Z",
    "immutable": true,
    "note": "This interpretation is now frozen on blockchain and cannot be edited"
  }
}
```

✅ **Interpretation is IMMUTABLE - Cannot be changed anymore!**
🔒 **Frozen on blockchain as proof of diagnosis time!**

---

# 🔐 PHASE 7: Access Control & Blockchain Verification

## Step 7.1: Patient Grants Access to Another Doctor

**Endpoint:** `POST /v1/patients/access-grants`

Patient decides to allow a second doctor to review the record.

```bash
curl -X POST http://localhost:3000/v1/patients/access-grants \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorAddress": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42",
    "doctorId": "665a1234567890abcd12348",
    "accessLevel": "FULL",
    "expiryDate": "2026-06-09",
    "reason": "Second opinion on cardiac diagnosis"
  }'
```

**Expected Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "grant_001",
    "patientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "doctorAddress": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42",
    "accessLevel": "FULL",
    "status": "ACTIVE",
    "expiryDate": "2026-06-09",
    "grantedAt": "2026-04-09T13:00:00Z",
    "blockchainTx": "0xtx_grant_001",
    "blockchainEventEmitted": {
      "event": "AccessGranted",
      "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "doctor": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42",
      "level": 2,
      "timestamp": 1712745600
    }
  }
}
```

## Step 7.2: Second Doctor Reads Record (Access Granted)

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001 \
  -H "Authorization: Bearer $DOCTOR_TWO_TOKEN"
```

**Expected Response (200):**

- ✅ Full record returned
- ✅ All test values visible
- ✅ Interpretation visible
- ⅴ Access verified on blockchain

## Step 7.3: Third Doctor Tries to Read (Should Fail)

Doctor without access grant tries to read:

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001 \
  -H "Authorization: Bearer $DOCTOR_NO_ACCESS_TOKEN"
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "ACCESS_DENIED",
  "message": "You do not have permission to access this patient's record. Patient has not granted access.",
  "details": {
    "patientId": "665a1234567890abcd12345",
    "doctorAddress": "0x...",
    "blockchainCheck": "No active access grant found"
  }
}
```

❌ **Access DENIED - Blockchain enforcement!**

## Step 7.4: Verify Blockchain Events

**Endpoint:** `GET /v1/medical-records/{recordId}/blockchain-events`

Verify all blockchain events are recorded:

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001/blockchain-events \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "recordHash": "0x1a2b3c...",
    "events": [
      {
        "event": "RecordCreated",
        "timestamp": "2026-04-09T10:30:00Z",
        "hash": "0x1a2b3c...",
        "doctor": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
      },
      {
        "event": "LabResultsPosted",
        "timestamp": "2026-04-09T11:35:00Z",
        "hash": "0xlab123...",
        "labTech": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
      },
      {
        "event": "InterpretationPosted",
        "timestamp": "2026-04-09T12:30:00Z",
        "hash": "0xint456...",
        "doctor": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
      },
      {
        "event": "AccessGranted",
        "timestamp": "2026-04-09T13:00:00Z",
        "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "doctor": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42"
      }
    ]
  }
}
```

## Step 7.5: Patient Revokes Access

**Endpoint:** `DELETE /v1/patients/access-grants/{doctorAddress}`

```bash
curl -X DELETE http://localhost:3000/v1/patients/access-grants/0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42 \
  -H "Authorization: Bearer $PATIENT_TOKEN"
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Access revoked",
  "data": {
    "doctorAddress": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42",
    "status": "REVOKED",
    "revokedAt": "2026-04-09T14:00:00Z",
    "blockchainTx": "0xtx_revoke_001",
    "blockchainEvent": {
      "event": "AccessRevoked",
      "patient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "doctor": "0x1D96F2f6BeF1202E4C4D0a64f26382f5Ff215e42"
    }
  }
}
```

## Step 7.6: Verify Access is Revoked

Second doctor tries to read again:

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001 \
  -H "Authorization: Bearer $DOCTOR_TWO_TOKEN"
```

**Expected Response (403):**

```json
{
  "success": false,
  "error": "ACCESS_REVOKED",
  "message": "Your access to this patient's records has been revoked",
  "revokedAt": "2026-04-09T14:00:00Z"
}
```

---

# 👨‍⚕️ PHASE 8: Admin Operations

## Step 8.1: Admin Views All Users

**Endpoint:** `GET /v1/admins/users`

```bash
curl -X GET http://localhost:3000/v1/admins/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Step 8.2: Admin Views Pending Approvals

**Endpoint:** `GET /v1/admins/users?status=PENDING_APPROVAL`

```bash
curl -X GET http://localhost:3000/v1/admins/users?status=PENDING_APPROVAL \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Step 8.3: Admin Views Audit Logs

**Endpoint:** `GET /v1/admins/audit-logs`

```bash
curl -X GET http://localhost:3000/v1/admins/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -G \
  -d "limit=50" \
  -d "sort=-timestamp"
```

**Response shows:**

- User registrations
- Login events
- Record creations
- Access grants/revokes
- Lab result postings
- Interpretations posted

---

# ✔️ PHASE 9: Verification & Edge Cases

## Step 9.1: Hash Integrity Verification

**Endpoint:** `GET /v1/medical-records/{recordId}/verify`

Verify all hashes match (proof that data hasn't been tampered with):

```bash
curl -X GET http://localhost:3000/v1/medical-records/665a2000000000000000001/verify \
  -H "Authorization: Bearer $DOCTOR_TOKEN"
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "recordId": "665a2000000000000000001",
    "verification": {
      "recordHash": {
        "stored": "0x1a2b3c...",
        "computed": "0x1a2b3c...",
        "match": true
      },
      "labResultHash": {
        "stored": "0xlab123...",
        "computed": "0xlab123...",
        "match": true
      },
      "interpretationHash": {
        "stored": "0xint456...",
        "computed": "0xint456...",
        "match": true
      },
      "tampering": false,
      "integrityStatus": "VERIFIED"
    }
  }
}
```

✅ **All hashes match - NO tampering detected!**

## Step 9.2: Test Trying to Edit Interpretation (Should Fail)

```bash
curl -X PATCH http://localhost:3000/v1/medical-records/665a2000000000000000001/interpretation \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"interpretation": "New interpretation..."}'
```

**Expected Response (400 or 404):**

```json
{
  "success": false,
  "error": "IMMUTABLE_RECORD",
  "message": "Cannot modify interpretation. It has been posted to blockchain and is immutable."
}
```

❌ **Interpretation CANNOT be edited - Blockchain frozen!**

## Step 9.3: Test 1 ACTIVE Record Constraint Again (After Completion)

After marking record as complete:

```bash
curl -X POST http://localhost:3000/v1/doctors/patients/665a1234567890abcd12345/medical-records \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{"type": "FOLLOW_UP"}'
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "New record created",
  "data": {
    "_id": "665a2000000000000000002",
    "status": "CREATED"
  }
}
```

✅ **New record created successfully - Previous one was COMPLETED!**

## Step 9.4: Test Permission Boundaries

### Lab Tech Tries to Update Diagnosis (Should Fail)

```bash
curl -X PATCH http://localhost:3000/v1/doctors/medical-records/665a2000000000000000001/diagnosis \
  -H "Authorization: Bearer $LAB_TECH_TOKEN" \
  -d '{"diagnosis": "..."}'
```

**Expected Response (403):**

```json
{
  "error": "ROLE_DENIED",
  "message": "Only doctors can update diagnosis"
}
```

### Patient Tries to Post Lab Results (Should Fail)

```bash
curl -X POST http://localhost:3000/v1/lab-techs/test-results \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d '{"testType": "..."}'
```

**Expected Response (403):**

```json
{
  "error": "ROLE_DENIED",
  "message": "Only lab technicians can post results"
}
```

### Doctor Tries to Consent (Should Fail)

```bash
curl -X POST http://localhost:3000/v1/patients/lab-orders/665a3000000000000000001/consent \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{}'
```

**Expected Response (403):**

```json
{
  "error": "ROLE_DENIED",
  "message": "Only patients can consent to lab orders"
}
```

---

# 📋 Complete Testing Checklist

## Phase 0: Environment

- [ ] Server running on <http://localhost:3000>
- [ ] MongoDB connected
- [ ] Blockchain (Sepolia) connected
- [ ] All contracts deployed

## Phase 1: Authentication

- [ ] Patient registration ✅
- [ ] Doctor registration ✅
- [ ] Lab tech registration ✅
- [ ] All users approved by admin✅
- [ ] Patient login (NationID + Password) ✅
- [ ] Doctor login (MetaMask) ✅
- [ ] Lab tech login (MetaMask) ✅
- [ ] Tokens generated correctly ✅

## Phase 2: Medical Records

- [ ] POST /v1/doctors/patients/{id}/medical-records - Doctor creates medical record ✅
  - [ ] Successfully creates with chief_complaint + vital_signs (temperature required)
  - [ ] Status = CREATED (with full clinical examination data)
  - [ ] Missing chief_complaint → 400 error
  - [ ] Missing vital_signs.temperature → 400 error
  - [ ] chief_complaint < 5 chars → 400 error
  - [ ] chief_complaint > 1000 chars → 400 error
  - [ ] Optional fields (physical_exam, assessment, plan) accepted correctly
  - [ ] Get medicalRecordId from response
- [ ] ⏩ Skip diagnosis for now - test results needed first
- [ ] 1 ACTIVE record constraint enforced ✅
- [ ] Cannot create 2nd record while ACTIVE ✅

## Phase 3: Lab Orders

- [ ] Doctor creates lab order ✅
- [ ] Status = ORDERED ✅
- [ ] Order hash generated ✅
- [ ] Lab tech CANNOT post without consent ✅

## Phase 4: Patient Consent

- [ ] Patient views pending orders ✅
- [ ] Patient can consent ✅
- [ ] Patient can reject ✅
- [ ] Status changes to CONSENTED ✅
- [ ] Blockchain event emitted ✅

## Phase 5: Lab Results

- [ ] Lab tech gets ONLY consented orders ✅
- [ ] Lab tech posts TROPONIN ✅
- [ ] Lab tech posts BNP ✅
- [ ] Lab tech posts CBC ✅
- [ ] Lab tech posts CMP ✅
- [ ] Status = RESULT_POSTED ✅
- [ ] All hashes stored on blockchain ✅

## Phase 6: Diagnosis & Interpretation

- [ ] PATCH /v1/doctors/medical-records/{id}/diagnosis - **NOW add diagnosis** (with testResultId) ✅
  - [ ] Successfully adds diagnosis with testResultId
  - [ ] Status = DIAGNOSED
  - [ ] Missing testResultId → 400 (test results must exist!)
  - [ ] Invalid testResultId → 404
  - [ ] Empty diagnosis → 400
  - [ ] diagnosis > 1000 chars → 400
  - [ ] Can be called AFTER lab results posted only
- [ ] Doctor retrieves full record ✅
- [ ] Doctor sees all test values ✅
- [ ] Doctor posts interpretation (IMMUTABLE) ✅
- [ ] Status = DOCTOR_REVIEWED ✅
- [ ] Cannot edit interpretation ✅

## Phase 7: Access Control

- [ ] Patient grants access to doctor ✅
- [ ] Doctor can read record ✅
- [ ] Other doctor CANNOT read ✅
- [ ] Patient revokes access ✅
- [ ] Doctor cannot read anymore ✅
- [ ] Blockchain events logged ✅

## Phase 8: Admin

- [ ] Admin approves users ✅
- [ ] Admin views all users ✅
- [ ] Admin views audit logs ✅

## Phase 9: Edge Cases

- [ ] Hash integrity verified ✅
- [ ] Cannot edit interpretation ✅
- [ ] New record created after completion ✅
- [ ] Role-based access enforced ✅
- [ ] Lab tech blocked without consent ✅
- [ ] All permissions boundaries tested ✅

---

**Total Test Cases:** 50+  
**Coverage:** From registration to record completion  
**Status:** Ready for comprehensive testing
