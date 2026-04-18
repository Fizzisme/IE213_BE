# 📮 Postman Collection Import Guide

**Purpose:** Step-by-step instructions to import Swagger API documentation into Postman for testing  
**Status:** Ready for team use  
**Last Updated:** April 9, 2026

---

## 📋 Table of Contents

1. [Quick Start (5 minutes)](#-quick-start)
2. [Manual Import Steps](#-manual-import-steps)
3. [Environment Setup](#-environment-setup)
4. [Testing Workflows](#-testing-workflows)
5. [Troubleshooting](#-troubleshooting)

---

## ⚡ Quick Start

### Option A: Direct URL Import (Recommended)

1. **Open Postman** → Click "Import" (top left)
2. **Select "Link"** tab
3. **Paste URL:**

   ```
   http://localhost:8017/api-docs.json
   ```

4. **Click "Continue"** → **"Import"**
5. **Done!** Your collection is imported

### Option B: Manual JSON Import

1. **Download Swagger JSON:**

   ```bash
   curl http://localhost:8017/api-docs.json > ehr_api.json
   ```

2. **Open Postman** → Click "Import"

3. **Select "Upload Files"** → Choose `ehr_api.json`

4. **Click "Import"**

---

## 🔧 Environment Setup

### Step 1: Create Postman Environment

1. **Click "Environments"** (left sidebar)
2. **Click "+" to create new**
3. **Name:** `EHR Local Development`
4. **Add Variables:**

| Variable | Initial Value | Current Value | Notes |
|----------|--------|--------|-------|
| `base_url` | `http://localhost:8017` | `http://localhost:8017` | API server |
| `token` | `` | `` | Leave blank, will auto-fill after login |
| `patient_token` | `` | `` | Patient JWT |
| `doctor_token` | `` | `` | Doctor JWT |
| `lab_tech_token` | `` | `` | Lab Tech JWT |
| `patient_id` | `` | `` | MongoDB ObjectId |
| `doctor_id` | `` | `` | MongoDB ObjectId |
| `lab_tech_id` | `` | `` | MongoDB ObjectId |
| `patient_address` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Wallet address |
| `doctor_address` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Wallet address |
| `lab_tech_address` | `0x1CBd3B2770C6eB170e071519F8246Ccd4e2f7f30` | `0x1CBd3B2770C6eB170e071519F8246Ccd4e2f7f30` | Wallet address |
| `record_id` | `` | `` | Medical record ID (populated after test) |
| `order_id` | `` | `` | Lab order ID (populated after test) |

1. **Save** (Ctrl+S / Cmd+S)

---

## 🔑 Authentication Setup

### Step 1: Register Users

1. **Open Collection** → Find `Auth` folder
2. **Open `POST /v1/auth/register`**
3. **Click "Body"** tab
4. **Edit JSON:**

   ```json
   {
     "email": "patient@hospital.com",
     "password": "password123",
     "nationId": "123456789",
     "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
   }
   ```

5. **Click "Send"**
6. **Save response `userId`** for later use

**Repeat for:**

- Doctor: `doctor@hospital.com` + `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Lab Tech: `labtech@hospital.com` + `0x1CBd3B2770C6eB170e071519F8246Ccd4e2f7f30`

### Step 2: Login and Get Token

1. **Open `POST /v1/auth/login/nationId`**
2. **Click "Body"**
3. **Edit:**

   ```json
   {
     "nationId": "123456789",
     "password": "password123"
   }
   ```

4. **Send**
5. **Copy token from response**
6. **Paste into environment variable `patient_token`**

**Repeat for doctor and lab tech with their credentials**

### Step 3: Set Bearer Token Globally

1. **Click "EHR Local Development"** environment
2. **In collection root**, click **"Authorization"** tab
3. **Type:** Select `Bearer Token`
4. **Token:** `{{patient_token}}` (or whichever token you're using)
5. **Save**

Now all requests will automatically include the token!

---

## 🧪 Testing Workflows

### ✅ WORKFLOW 1: Complete Lab Order (9 Steps)

**Prerequisite:** Doctor and Patient tokens must be set

#### STEP 1: Doctor Creates Lab Order

```
POST /v1/lab-orders
Environment: patient_token → doctor_token
Body: {
  "patientAddress": "{{patient_address}}",
  "recordType": "DIABETES_TEST",
  "testsRequested": [...],
  "priority": "normal",
  "clinicalNote": "...",
  "sampleType": "blood"
}
```

**Then:** Copy response `_id` → save to environment as `record_id`

#### STEP 2: Patient Consents

```
POST /v1/lab-orders/{{record_id}}/consent
Environment: patient_token
Body: {"approved": true}
```

**Verify:** Status changed to CONSENTED

#### STEP 3: Lab Tech Gets Pending Orders

```
GET /v1/lab-techs/pending-orders
Environment: lab_tech_token
```

**Verify:** Your record appears in list

#### STEP 4-5: Lab Tech Posts Results

```
POST /v1/lab-techs/test-results
Environment: lab_tech_token
Body: {
  "medicalRecordId": "{{record_id}}",
  "testType": "GLUCOSE",
  "rawData": {"glucose": 285, "unit": "mg/dL"}
}
```

**Repeat for:** A1C, CBC

#### STEP 6: Doctor Views Results

```
GET /v1/medical-records/{{record_id}}
Environment: doctor_token
```

**Verify:** All test results visible

#### STEP 7: Doctor Updates Diagnosis

```
PATCH /v1/doctors/medical-records/{{record_id}}/diagnosis
Environment: doctor_token
Body: {
  "diagnosis": "Type 2 Diabetes confirmed",
  "diagnosisCode": "E11.9",
  "confirmedDiagnosis": "Type 2 Diabetes",
  "note": "Confirmed by lab results"
}
```

#### STEP 8: Doctor Posts Interpretation

```
POST /v1/medical-records/{{record_id}}/interpretation
Environment: doctor_token
Body: {
  "interpretation": "Fasting glucose 285 mg/dL indicates severe hyperglycemia..."
}
```

**Status:** Changes to DOCTOR_REVIEWED (IMMUTABLE)

#### STEP 9: Verify Complete Record

```
GET /v1/patient-records/{{record_id}}
Environment: patient_token
```

**Verify:** All 3 hashes present

---

### ✅ WORKFLOW 2: Access Control (5 Steps)

#### STEP 1: Patient Grants Access

```
POST /v1/access-control/grant
Environment: patient_token
Body: {
  "accessorAddress": "{{doctor_address}}",
  "level": "FULL",
  "durationHours": 168
}
```

#### STEP 2: Doctor Reads Records

```
GET /v1/doctors/medical-records
Environment: doctor_token
```

**Verify:** Can now see records

#### STEP 3: Unauthorized Access Attempt

```
GET /v1/medical-records/{{record_id}}
Environment: other_doctor_token
```

**Verify:** Returns 403

#### STEP 4: Patient Revokes Access

```
POST /v1/access-control/revoke
Environment: patient_token
Body: {
  "accessorAddress": "{{doctor_address}}"
}
```

#### STEP 5: Verify Revocation

```
GET /v1/doctors/medical-records
Environment: doctor_token
```

**Verify:** Returns 403

---

## 📊 Collection Structure

After import, your Postman collection should have:

```
📦 EHR API
├── 🔐 Auth
│   ├── POST /v1/auth/register
│   ├── POST /v1/auth/login/nationId
│   ├── POST /v1/auth/login/wallet
│   └── DELETE /v1/auth/logout
├── 🏥 Lab Orders
│   ├── POST /v1/lab-orders
│   ├── PATCH /v1/lab-orders/{id}/consent
│   ├── PATCH /v1/lab-orders/{id}/receive
│   └── PATCH /v1/lab-orders/{id}/post-result
├── 🩺 Lab Tech
│   ├── GET /v1/lab-techs/test-results
│   ├── POST /v1/lab-techs/medical-records/{id}/test-results
│   └── GET /v1/lab-techs/medical-records
├── 👨‍⚕️ Doctor
│   ├── GET /v1/doctors/medical-records/{id}
│   ├── GET /v1/doctors/test-results/{id}
│   ├── PATCH /v1/doctors/medical-records/{id}/diagnosis ⚠️
│   ├── POST /v1/medical-records/{id}/interpretation ⚠️
│   └── ... (8 endpoints total)
├── 🔐 Access Control
│   ├── POST /v1/access-control/grant
│   ├── PATCH /v1/access-control/update
│   ├── POST /v1/access-control/revoke
│   ├── POST /v1/access-control/check
│   └── POST /v1/access-control/grant-info
├── 📋 Patient Records
│   ├── GET /v1/patient-records
│   └── GET /v1/patient-records/{id}
└── ⛓️ Blockchain
    ├── GET /v1/blockchain/health
    └── POST /v1/blockchain/sync-events
```

**Note:** ⚠️ = Missing from Swagger docs (need to add manually if not auto-imported)

---

## 🔧 Advanced: Pre-request Scripts

### Auto-populate IDs from Previous Response

Add to STEP 2 request (Patient Consents):

```javascript
// Pre-request Script
// (Runs BEFORE the request)
// Leave blank for first run
```

Add to STEP 1 response:

```javascript
// Tests / Post-response Script
// (Runs AFTER the request)
if (pm.response.code === 201) {
  let responseData = pm.response.json();
  pm.environment.set("record_id", responseData.data._id);
  pm.environment.set("order_hash", responseData.data.orderHash);
  console.log("✅ Saved record_id: " + responseData.data._id);
}
```

---

## ⚠️ Troubleshooting

### Issue: "401 Unauthorized"

**Cause:** Token expired or not set  
**Fix:**

1. Re-login to get fresh token
2. Update `patient_token` in environment
3. Verify Bearer token is set in Authorization

### Issue: "403 Forbidden - Patient has not consented"

**Cause:** Skipped STEP 2 or status not CONSENTED  
**Fix:**

1. Go back to STEP 2 (Consent)
2. Verify response shows status = CONSENTED
3. Wait a moment, then retry STEP 4

### Issue: "404 Not Found" on `/v1/doctors/medical-records/{recordId}/diagnosis`

**Cause:** Endpoint not in Swagger (known issue)  
**Fix:**

1. Manually add to collection:
   - Method: PATCH
   - URL: `{{base_url}}/v1/doctors/medical-records/{{record_id}}/diagnosis`
   - Auth: Bearer `{{doctor_token}}`
   - Body: `{"diagnosis": "...", "diagnosisCode": "..."}`

### Issue: "Postman collection is empty"

**Cause:** Import failed  
**Fix:**

1. Check API server is running: `curl {{base_url}}/api-docs.json`
2. If not accessible, restart backend
3. Try manual JSON import instead

### Issue: "Cannot POST to wallet address 0x..."

**Cause:** Wallet address registered but not active (status = PENDING)  
**Fix:**

1. Admin must approve the user (contact admin)
2. Or use different wallet address already approved
3. Check user status via `/v1/auth/login`

---

## 📋 Postman Collection Checklist

Before sharing with team, verify:

- [ ] All 30+ endpoints imported
- [ ] Environment variables created and populated
- [ ] Bearer token configured in collection auth
- [ ] STEP 1-9 lab order workflow tested and working
- [ ] STEP 1-5 access control workflow tested and working
- [ ] Error scenarios returning expected codes (400, 403, 404)
- [ ] Response times reasonable (< 1s for most endpoints)
- [ ] No console errors in Postman

---

## 📤 Sharing with Team

### Export Collection

```
Postman → Collections → Right-click "EHR API" → Export
Format: JSON (Postman v2.1)
Save as: EHR_API_Collection.json
```

### Share Collection + Environment

1. Export collection (above)
2. Export environment:

   ```
   Postman → Environments → Right-click "EHR Local Development" → Export
   Save as: EHR_Environment.json
   ```

3. Send files to team
4. Team imports both files
5. Team updates environment with their IDs/tokens

---

## 🎯 Next Steps

1. ✅ Import Swagger docs
2. ✅ Setup environment variables
3. ✅ Authenticate (register + login)
4. ✅ Run WORKFLOW 1 (Lab Order)
5. ✅ Run WORKFLOW 2 (Access Control)
6. ✅ Test error scenarios
7. ✅ Export and share with team

---

## ℹ️ Additional Resources

| Resource | Location |
|----------|----------|
| **Swagger UI** | `http://localhost:8017/api-docs` |
| **OpenAPI JSON** | `http://localhost:8017/api-docs.json` |
| **Testing Guide** | `docs/API_TESTING_GUIDE_COMPLETE.md` |
| **Architecture Docs** | `docs/ARCHITECTURE_OVERVIEW.md` |
| **Validation Report** | `docs/SWAGGER_DOCUMENTATION_VALIDATION.md` |

---

**Questions?** Check the main API Testing Guide or contact the development team.
