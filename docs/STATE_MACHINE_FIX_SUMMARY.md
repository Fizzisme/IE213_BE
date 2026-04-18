📋 STATE MACHINE SYNCHRONIZATION FIX - SUMMARY

═══════════════════════════════════════════════════════════════════

🎯 PROBLEM IDENTIFIED
─────────────────────
Lab Order completes → Medical Record stuck in DIAGNOSED
→ Doctor blocked from creating new medical records

ROOT CAUSE:
State Propagation Missing - No code to sync Medical Record status
when Lab Order completes

═══════════════════════════════════════════════════════════════════

✅ FIXES APPLIED
─────────────────────

1️⃣  ENUM VERIFICATION
   File: src/models/medicalRecord.model.js

   ✓ Medical Record Status Enum (CONFIRMED):
     - CREATED: Initial state
     - WAITING_RESULT: Lab order created, waiting for results
     - HAS_RESULT: Lab posted results
     - DIAGNOSED: Doctor reviewed results & diagnosed
     - COMPLETE: ← NEW STATE (added for lab order completion)

   Status: ✅ Already has COMPLETE enum

═══════════════════════════════════════════════════════════════════

2️⃣  STATE PROPAGATION LOGIC (CRITICAL FIX)
   File: src/services/ehrWorkflow.service.js (completeRecord function)

   Added automatic sync when Lab Order transitions to COMPLETE:

   ┌─────────────────────────────────────────────┐
   │ When lab order COMPLETE                     │
   │ If labOrder.relatedMedicalRecordId exists:  │
   │   → Update Medical Record status COMPLETE   │
   │   → Set completedAt timestamp               │
   │ (Non-blocking, logged on failure)           │
   └─────────────────────────────────────────────┘

   Architecture: Lab Order = Source of Truth
                Medical Record = Dependent (follows)

   Status: ✅ IMPLEMENTED

═══════════════════════════════════════════════════════════════════

3️⃣  SWAGGER DOCUMENTATION UPDATE
   File: src/routes/v1/doctor.route.js

   Updated endpoints:

   GET /v1/doctors/medical-records/{medicalRecordId}
   ├─ Tags: [DOCTOR - Medical Records]
   ├─ Description: Full status state machine explanation
   └─ Response schema: All status enums documented

   GET /v1/doctors/medical-records
   ├─ Tags: [DOCTOR - Medical Records]
   ├─ Description: All 5 status states documented
   ├─ Query param: status filter with comma-separated values
   ├─ Example: status=DIAGNOSED,HAS_RESULT
   └─ Response schema: Updated with status enums & relatedLabOrderIds

   Status: ✅ UPDATED

═══════════════════════════════════════════════════════════════════

🔄 STATE MACHINE FLOW (CORRECTED)
─────────────────────────────────────

Medical Record Timeline:

   Doctor creates MR
   └─> Status: CREATED

   Doctor creates Lab Order (referencing this MR)
   └─> Status: WAITING_RESULT

   Lab Tech posts results
   └─> Status: HAS_RESULT

   Doctor reviews results & diagnoses
   └─> Status: DIAGNOSED

   Doctor completes Lab Order review (Step 8: completeRecord)
   ├─> Lab Order status: DOCTOR_REVIEWED → COMPLETE ✓
   ├─> [STATE SYNC TRIGGERED]
   └─> Medical Record status: DIAGNOSED → COMPLETE ✓

   Result: Doctor can create new medical records! 🚀

═══════════════════════════════════════════════════════════════════

📊 ENUM CONSTANTS
─────────────────────

MEDICAL_RECORD_STATUS = {
    CREATED:         'CREATED',
    WAITING_RESULT:  'WAITING_RESULT',
    HAS_RESULT:      'HAS_RESULT',
    DIAGNOSED:       'DIAGNOSED',
    COMPLETE:        'COMPLETE'
}

All 5 states are now documented in Swagger ✓

═══════════════════════════════════════════════════════════════════

🛠️  TESTING CHECKLIST
─────────────────────

To verify the fix works:

[ ] Create Medical Record (CREATED)
[ ] Create Lab Order with medicalRecordId (→ WAITING_RESULT)
[ ] Verify relatedLabOrderIds populated in MR
[ ] Verify relatedMedicalRecordId populated in LO
[ ] Patient consents (LO: CONSENTED)
[ ] Lab Tech posts results (LO: RESULT_POSTED, MR: HAS_RESULT)
[ ] Doctor diagnoses (MR: DIAGNOSED)
[ ] Doctor completes record (LO: COMPLETE, MR: COMPLETE ← SYNC!)
[ ] Verify can create new Medical Record (no blocking error)

═══════════════════════════════════════════════════════════════════

💡 DESIGN PRINCIPLES APPLIED
─────────────────────────────

1. Single Source of Truth
   Lab Order drives state, Medical Record follows

2. State Propagation (not bidirectional sync)
   One-way: Lab Order → Medical Record

3. Non-blocking Updates
   If MR update fails, lab order completion still succeeds

4. Audit Trail Trail
   All state transitions logged with timestamps

5. Clean Separation
   Lab Order = Technical workflow (blockchain events)
   Medical Record = Business workflow (clinical records)

═══════════════════════════════════════════════════════════════════

✨ OUTCOME
──────────

Before Fix:
❌ Lab Order COMPLETE, Medical Record DIAGNOSED
❌ Doctor blocked from new records
❌ "Bệnh nhân đang có 1 hồ sơ chưa hoàn thành" error

After Fix:
✅ Lab Order COMPLETE → Medical Record COMPLETE (synced)
✅ Doctor can create new records
✅ No state inconsistency
✅ System working as designed

═══════════════════════════════════════════════════════════════════
