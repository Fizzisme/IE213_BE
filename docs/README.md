# 📚 Documentation Directory

**Complete Patient Examination Workflow Documentation**

---

## 📖 Main Documentation Files

### ⭐ **START HERE**

1. **[INDEX.md](INDEX.md)** - Documentation index and quick navigation
2. **[COMPLETE_PATIENT_WORKFLOW.md](COMPLETE_PATIENT_WORKFLOW.md)** - Full workflow from registration to examination complete

### 📋 Workflow Documentation

- **COMPLETE_PATIENT_WORKFLOW.md** - End-to-end medical examination workflow
  - Patient registration with blockchain
  - Admin approval process
  - Access control (patient grants to doctor)
  - Medical examination creation
  - Lab order creation
  - Test result submission
  - Results review and finalization

---

## 🔧 Reference Documentation

### Technical References

- **admin-permission-explained.md** - Admin role permissions and capabilities
- **backend-blockchain-optimization.md** - Blockchain optimization strategies
- **contracts-v2-diff-notes.md** - Smart contract changes and updates
- **FRONTEND-TESTING-GUIDE.md** - Frontend testing procedures
- **FRONTEND-LAB-ORDER-API-GUIDE.md** - Lab order API for frontend integration

### Postman Collections

- **POSTMAN-QUICK-START.md** - Quick setup for Postman testing
- **POSTMAN-COMPLETE-SETUP-GUIDE.md** - Detailed Postman configuration
- **Postman/** - Postman collection files and environment configs

---

## 🚀 Quick Start

### For New Developers

1. Read: [INDEX.md](INDEX.md) (5 min)
2. Read: [COMPLETE_PATIENT_WORKFLOW.md](COMPLETE_PATIENT_WORKFLOW.md) (30 min)
3. Reference: Root directory `DEVELOPER_QUICK_REFERENCE.md` (patterns)
4. Test: Run `test-complete-flow.js` (validate setup)

### For QA/Testers

1. Review: [COMPLETE_PATIENT_WORKFLOW.md](COMPLETE_PATIENT_WORKFLOW.md) - Test scenarios
2. Use: Postman collections in `./Postman` directory
3. Check: [FRONTEND-TESTING-GUIDE.md](FRONTEND-TESTING-GUIDE.md) - Frontend testing

### For DevOps/Deployment

1. Review: [COMPLETE_PATIENT_WORKFLOW.md](COMPLETE_PATIENT_WORKFLOW.md) - Full scope
2. Check: Root `VERIFICATION_CHECKLIST.md` - Pre-deployment checks
3. Reference: Root `ERROR_PREVENTION_FIXES_APPLIED.md` - Scope of changes

---

## 📊 Workflow Steps

```
Step 1: Patient Registration & Blockchain Setup
  ↓ Endpoint: POST /api/v1/auth/register
  ↓ Storage: User model with blockchainAccount field

Step 2: Admin Approval
  ↓ Endpoint: PATCH /api/v1/admins/users/:id/approve  
  ↓ Pattern: Transaction Pattern (blockchain FIRST)

Step 3: Patient Grants Access
  ↓ Endpoint: POST /api/v1/access-control/grant
  ↓ Pattern: Auto-Revoke (check → revoke → grant)

Step 4: Medical Examination
  ↓ Endpoint: POST /api/v1/medical-record/create
  ↓ Storage: Medical record linked to patient

Step 5: Lab Order Creation
  ↓ Endpoint: POST /api/v1/lab-order/create
  ↓ Storage: Lab order assigned to lab tech

Step 6: Test Results Submission
  ↓ Endpoint: POST /api/v1/test-result/create
  ↓ Pattern: Transaction Pattern (blockchain stored)

Step 7: Results Finalization
  ↓ Endpoint: PUT /api/v1/medical-record/:id/finalize
  ↓ Result: Examination complete
```

---

## 🔒 Key Security Patterns

See root directory for detailed guides:

- **DEVELOPER_QUICK_REFERENCE.md** - 5 error prevention patterns with code examples
- **ERROR_PREVENTION_FIXES_APPLIED.md** - Detailed changes made
- **VERIFICATION_CHECKLIST.md** - QA testing checklist

### Patterns Implemented

1. **Transaction Pattern** - Blockchain FIRST, DB second
2. **Auto-Revoke Pattern** - Safe retry for access grants
3. **Wallet Validation** - Required + format + uniqueness checks
4. **Audit Log Pattern** - Proper schema with null entityId
5. **Blockchain Account Tracking** - Separate state management

---

## 🧪 Testing Resources

### Postman Collections

```
Postman/
├── Complete-EHR-Comprehensive-Testing.json
├── Complete-EHR-Environment.json
├── Postman-Admin-CMND-Verification.json
├── Postman-Admin-Complete-CMND-Testing.json
├── Postman-Admin-CMND-Environment.json
└── (other collections)
```

**Setup:**

1. Import environment JSON in Postman
2. Import collection JSON
3. Follow [POSTMAN-QUICK-START.md](POSTMAN-QUICK-START.md)

### Automated Tests

- See root: `test-complete-flow.js` - Run validation tests
- Command: `node test-complete-flow.js`

---

## 📞 Help & Troubleshooting

### Common Issues

See [COMPLETE_PATIENT_WORKFLOW.md](COMPLETE_PATIENT_WORKFLOW.md) → "Troubleshooting" section

### API Errors

See root: `ERROR_PREVENTION_FIXES_APPLIED.md` → "Error Prevention Summary"

### Pattern Questions

See root: `DEVELOPER_QUICK_REFERENCE.md` - Code examples and patterns

### Postman Setup Issues

See: [POSTMAN-COMPLETE-SETUP-GUIDE.md](POSTMAN-COMPLETE-SETUP-GUIDE.md)

---

## 📋 File Organization

```
docs/
├── INDEX.md                          ⭐ Start here
├── COMPLETE_PATIENT_WORKFLOW.md      ⭐ Main workflow
├── admin-permission-explained.md     Reference
├── backend-blockchain-optimization.md Reference
├── contracts-v2-diff-notes.md        Reference
├── FRONTEND-TESTING-GUIDE.md         Frontend
├── FRONTEND-LAB-ORDER-API-GUIDE.md   Frontend
├── POSTMAN-QUICK-START.md            Testing
├── POSTMAN-COMPLETE-SETUP-GUIDE.md   Testing
├── Postman/                          Collections
│   ├── Complete-EHR-*.json
│   ├── Postman-Admin-*.json
│   └── ...
└── README.md                         You are here
```

---

## 🚀 Next Steps

1. **Understand the Workflow**
   - Read: COMPLETE_PATIENT_WORKFLOW.md
   - Time: ~30 minutes

2. **Understand Error Prevention**
   - Read: Root DEVELOPER_QUICK_REFERENCE.md
   - Time: ~20 minutes

3. **Test the Implementation**
   - Run: `node test-complete-flow.js`
   - Manual: Use Postman collections
   - Time: ~30 minutes

4. **Deploy to Production**
   - Check: Root VERIFICATION_CHECKLIST.md
   - Time: ~1 hour

---

## ✅ Documentation Status

- **Last Updated:** April 8, 2026
- **Version:** 1.0 (Complete Workflow)
- **Status:** ✅ Ready for Production
- **Coverage:** 100% of patient examination workflow

---

**All old testing guides have been removed and consolidated into COMPLETE_PATIENT_WORKFLOW.md**

---

## ✅ Complete Test Coverage

### 40+ Requests Organized in 8 Sections

```
📋 SECTION 1: Authentication & Setup (🔐)
   ├─ Admin CMND login
   ├─ Doctor wallet login (2 phases)
   ├─ Lab tech wallet login (2 phases)
   ├─ Patient A wallet login (2 phases)
   └─ Patient B wallet login (2 phases)

🔐 SECTION 2: Access Control & Permissions
   ├─ Grant doctor permission
   └─ Check permission status

🔬 SECTION 3: Lab Orders Detailed Workflow ⭐ CORE FEATURE
   ├─ STEP 1: Doctor creates lab order
   ├─ STEP 2: View lab order detail
   ├─ STEP 3: Patient consents
   ├─ STEP 4: Lab tech receives
   ├─ STEP 5: Lab tech posts results (LOCKED)
   ├─ STEP 6: Doctor adds interpretation
   ├─ STEP 7: Doctor completes (IMMUTABLE)
   └─ STEP 8: List orders

👨‍⚕️ SECTION 4: Patient Operations
   ├─ Get patient profile
   └─ List patient's lab orders

🏥 SECTION 5: Doctor Operations
   ├─ Get doctor profile
   └─ List doctor's patients with permission

🧪 SECTION 6: Lab Tech Operations
   ├─ Get lab tech profile
   └─ List lab tech's pending orders

📝 SECTION 7: Medical Records
   ├─ Create medical record
   └─ Get patient's medical records

⛓️ SECTION 8: Blockchain Verification
   └─ Verify lab order on blockchain
```

---

## 🚀 Quick Start (3 Steps)

### Step 1: Open Documentation

1. Read **QUICK-REFERENCE.md** for overview
2. Read **EHR-COMPREHENSIVE-TESTING-GUIDE.md** for details

### Step 2: Import into Postman

1. Postman → Import → Upload `Complete-EHR-Comprehensive-Testing.json`
2. Postman → Import → Upload `Complete-EHR-Environment.json`
3. Select environment from dropdown

### Step 3: Run Tests

1. Run **Section 1** - Get all tokens ✅
2. Run **Section 3** - Complete Lab Orders workflow ✅
3. View results in Postman console ✅

---

## 📊 What Gets Tested

### ✅ Blockchain Integration

- Lab orders created and tracked on blockchain
- Status transitions recorded on-chain
- Result locking and immutability verified
- Hash verification working

### ✅ Permission System

- Patient grants doctor permission
- Doctor sees only permitted patients
- Sensitive records protected
- Permission status tracked

### ✅ Lab Order Workflow

- Complete 8-step workflow
- Correct status transitions
- All roles can perform actions
- Data locked at proper time

### ✅ Role-Based Access

- Admin operations
- Doctor operations
- Lab tech operations
- Patient operations

### ✅ Error Handling

- Invalid transitions rejected
- Permission denied properly
- Record locked errors
- Proper error messages

---

## 👥 Test Accounts

### Your Testing Team

| Role | Wallet | Token | CMND |
|------|--------|-------|------|
| Admin | 0x77e2... | From Section 1.3 | 064205000890 / sapi03042011 |
| Doctor | 0xDd20... | From Section 1.4 | - |
| Lab Tech | 0xa2C... | From Section 1.5 | - |
| Patient A | 0xED9... | From Section 1.6 | - |
| Patient B | 0x297... | From Section 1.7 | - |

All credentials are in the Postman environment file.

---

## 🔍 Key Features Highlighted

### 🌟 Lab Orders Core Workflow

The **8-step Lab Orders workflow** is the most important feature:

```
Doctor Creates Order
        ↓
    Patient Consents
        ↓
    Lab Tech Receives
        ↓
Lab Tech Posts Results (LOCKED - cannot be modified)
        ↓
       Doctor Interpretation
        ↓
    Doctor Completes (IMMUTABLE - nobody can modify)
        ↓
    Order Complete on Blockchain
```

### 🔒 Security Features

- **Result Locking**: After posting, lab results cannot be changed
- **Record Immutability**: After completion, entire record cannot be modified
- **Permission-Based**: Only patients can grant, only authorized users can access
- **Blockchain Verification**: All changes recorded on Sepolia testnet

---

## 📞 Getting Help

### Problem → Solution Finder

**"I can't connect to the server"**
→ Read: COMMON-ISSUES-AND-SOLUTIONS.md → Issue 1

**"My tokens aren't showing up"**
→ Read: COMMON-ISSUES-AND-SOLUTIONS.md → Issue 3

**"Lab order says 'not found'"**
→ Read: COMMON-ISSUES-AND-SOLUTIONS.md → Issue 4

**"I don't know what to do next"**
→ Read: QUICK-REFERENCE.md → 5-Minute Quick Start

**"I want to understand the full system"**
→ Read: EHR-COMPREHENSIVE-TESTING-GUIDE.md

**"The tests are failing"**
→ Read: COMMON-ISSUES-AND-SOLUTIONS.md → Troubleshooting

---

## 📋 File Structure

```
EHR_Project_Kaka/
└─ IE213_BE/
   └─ docs/
      ├─ Complete-EHR-Comprehensive-Testing.json     ← Import to Postman
      ├─ Complete-EHR-Environment.json               ← Import to Postman
      ├─ README.md                                   ← You are here
      ├─ QUICK-REFERENCE.md                          ← Quick start
      ├─ EHR-COMPREHENSIVE-TESTING-GUIDE.md          ← Full documentation
      └─ COMMON-ISSUES-AND-SOLUTIONS.md              ← Troubleshooting
```

---

## ✨ Next Steps

1. **Import Files** (3 min)
   - `Complete-EHR-Comprehensive-Testing.json`
   - `Complete-EHR-Environment.json`

2. **Read Quick Start** (5 min)
   - QUICK-REFERENCE.md

3. **Run First Test** (2 min)
   - Section 1: Get tokens

4. **Run Core Workflow** (5 min)
   - Section 3: 8-step Lab Orders

5. **Verify Results** (2 min)
   - Check console logs
   - Confirm all statuses

Total Time: ~17 minutes ⏱️

---

## 🎯 Success Criteria

✅ All 5 wallet tokens obtained (Section 1)
✅ Permission granted to doctor (Section 2)
✅ Lab order created successfully (Section 3, STEP 1)
✅ Patient consented (Section 3, STEP 3)
✅ Lab tech received order (Section 3, STEP 4)
✅ Lab results posted (Section 3, STEP 5)
✅ Doctor reviewed (Section 3, STEP 6)
✅ Order completed (Section 3, STEP 7)
✅ Blockchain verification works (Section 8)
✅ All 40+ requests return 200/201 status ✅

---

## 💡 Pro Tips

1. **Start with QUICK-REFERENCE.md** - fastest way to get started
2. **Watch Postman Console** (Cmd+Alt+C) - see detailed logs
3. **Check Environment Variables** - verify tokens are saving
4. **Follow STEP 1-7 in ORDER** - workflow is sequential
5. **Use same Lab Order ID** - all steps use same order

---

## 📝 Notes

- All documentation is in **Vietnamese-friendly format** with bilingual examples
- 8-step Lab Orders workflow is the **most critical feature**
- Server must be running: `npm run dev`
- MongoDB must be connected
- Postman must have environment selected
- Error scenarios are documented with fixes

---

## 🔗 Navigation Guide

```
START HERE
    ↓
QUICK-REFERENCE.md (5 min) ← How to import and run
    ↓
EHR-COMPREHENSIVE-TESTING-GUIDE.md (15 min) ← Detailed workflow
    ↓
Run Tests in Postman ← Import JSON files
    ↓
?Error?
    ↓
COMMON-ISSUES-AND-SOLUTIONS.md ← Find and fix
```

---

**Happy Testing! 🎉**

Questions? Check the appropriate documentation file above.
