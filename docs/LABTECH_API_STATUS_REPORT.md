# Lab Tech API Status Report - April 18, 2026

## Executive Summary
✅ **Issue B is CONFIRMED FIXED** - postLabResult now includes retry mechanism + status tracking
⚠️ **3 issues identified** with Lab Tech APIs that need resolution

---

## Issue B: TestResult Retry Mechanism - CONFIRMED ✅

### Status
The postLabResult() function has been successfully updated with Issue B fix:

```javascript
// Line 458-550 in ehrWorkflow.service.js
- Calls createTestResultWithRetry() helper with exponential backoff (1s→2s→4s, max 3 retries)
- Tracks testResultStatus (PENDING/PROCESSING/SUCCESS/FAILED)
- Response includes: testResultStatus, testResultRetryCount, testResultError
- Non-blocking: main flow continues if TestResult creation fails
```

### Response Format (New Fields Added)
```javascript
{
  message: 'Post kết quả thành công',
  orderId: '...',
  status: 'RESULT_POSTED',
  txHash: '0x...',
  // ✅ NEW FIELDS (Issue B):
  testResultStatus: 'SUCCESS' | 'FAILED',      // Result of retry attempts
  testResultRetryCount: 0 | 1 | 2 | 3,         // How many retries were needed
  testResultError: null | 'error message'      // Null if success, error text if failed
}
```

### Functionality
- **Retry Logic**: Exponential backoff (1s → 2s → 4s between retries, max 3 attempts)
- **Status Tracking**: Lab order stores testResultStatus in MongoDB
- **Non-Blocking**: If TestResult creation fails, lab order post succeeds anyway
- **Client Awareness**: Frontend can show retry count and error to lab tech

---

## Lab Tech API Endpoints Status

### 1. ✅ PATCH /v1/lab-orders/:id/receive
**Purpose:** Lab tech accepts/receives order (CONSENTED → IN_PROGRESS)

**Implementation:** `ehrWorkflow.receiveOrder()`
- ✅ Role validation (LAB_TECH only)
- ✅ Status validation (CONSENTED only)
- ✅ Wallet normalization
- ✅ Blockchain call: `updateRecordStatus(recordId, 2)`
- ✅ Audit logging
- ✅ Clear error messages

**Response:**
```javascript
{
  message: 'Tiếp nhận order thành công',
  orderId: '...',
  status: 'IN_PROGRESS',
  txHash: '0x...',
  updatedAt: '2026-04-18T...'
}
```

**Assessment:** ✅ GOOD - No changes needed

---

### 2. ⚠️ PATCH /v1/lab-orders/:id/post-result
**Purpose:** Lab tech posts test results

**Implementation:** `ehrWorkflow.postLabResult()` + Issue B fix
- ✅ Role validation
- ✅ Status validation (IN_PROGRESS only)
- ✅ TestResult creation with retry mechanism (Issue B)
- ✅ Audit logging
- ✅ New response fields (testResultStatus, testResultRetryCount, testResultError)

**Issues Found:**
- 🟡 **Swagger docs outdated**: Route swagger docs don't document the 3 new response fields
  - Missing: testResultStatus, testResultRetryCount, testResultError
  - **Impact**: Frontend/API clients assume old response format

**Assessment:** ⚠️ NEEDS: Update Swagger documentation

---

### 3. ⚠️ GET /v1/lab-orders (Query Lab Orders)
**Purpose:** Lab tech queries their assigned orders

**Implementation:** `labOrder.getLabOrders()` with LAB_TECH-specific filter

**Current Filter Logic:**
```javascript
filter.$or = [
  { sampleStatus: statusToFilter },           // ANY order with CONSENTED/IN_PROGRESS/etc
  { 'auditLogs.by': normalizedWalletAddress } // OR orders where lab tech already acted
]
```

**Issues Found:**

1. 🔴 **Returns ALL CONSENTED orders, not just assigned ones**
   - Example: Lab tech A logs in → sees ALL CONSENTED orders (not just theirs)
   - Should: Only see orders assigned to lab tech A

2. 🔴 **No explicit assignedLabTech field in model**
   - Current model (labOrder.model.js) has NO assignedLabTech field
   - Relying on implicit assignment via auditLogs (when lab tech receives order)
   - **Problem**: Before lab tech receives, order is visible to ALL lab techs

3. 🟡 **Assignment mechanism unclear**
   - Documentation (COMPLETE_PATIENT_WORKFLOW.md) mentions "assignedLabTech" field
   - Code doesn't implement explicit assignment
   - Question: Does admin need to implement order distribution/assignment?

**Assessment:** 🔴 **CRITICAL ISSUE** - Need to clarify and fix assignment logic

---

## Recommended Actions

### Priority 1: UPDATE SWAGGER DOCS (15 minutes)
**File:** `src/routes/v1/labOrder.route.js` (lines 270-300)

Update the POST /v1/lab-orders/:id/post-result response schema to include:
```yaml
testResultId:
  type: string
  description: MongoDB ID of created test result (null if failed)
testResultStatus:
  type: string
  enum: [SUCCESS, FAILED, PENDING]
  description: Status of test result creation after retry logic
testResultRetryCount:
  type: number
  description: Number of retry attempts made (0-3)
testResultError:
  type: string | null
  description: Error message if test result creation failed
```

### Priority 2: CLARIFY LAB TECH ASSIGNMENT MECHANISM (Discussion)
**Questions to answer:**
1. Should orders have explicit `assignedLabTech` field?
2. Who assigns orders to lab techs? (Admin? Doctor? Auto-assign?)
3. Can lab tech see only assigned orders, or all CONSENTED orders?
4. Should implement separate endpoint: `GET /v1/lab-orders/assigned` (only my orders)?

**Suggested Solution:**
```
1. Add assignedLabTech field to labOrder model
2. Implement admin endpoint: POST /v1/admin/lab-orders/:id/assign (admin assigns order)
3. Update getLabOrders filter:
   - LAB_TECH can only see:
     a) Orders where assignedLabTech == their ID
     b) OR orders they've already received (auditLogs.by recorded)
4. Default status filter: 'IN_PROGRESS' or 'RESULT_POSTED' (orders they're working on)
```

### Priority 3: TEST END-TO-END WORKFLOW (After fixes)
**Workflow to test:**
```
1. Doctor creates order (status=ORDERED)
2. Patient consents (status=CONSENTED)
3. Admin assigns order to lab tech A
4. Lab tech A receives order (status=IN_PROGRESS)
5. Lab tech A posts result (status=RESULT_POSTED, testResultStatus=SUCCESS)
6. Verify: Lab tech B cannot see this order
```

---

## Lab Tech API Maturity Matrix

| Endpoint | Status | Issue | Priority |
|----------|--------|-------|----------|
| POST /lab-orders | ✅ Create Order | None | - |
| PATCH /:id/receive | ✅ Accept Order | None | - |
| PATCH /:id/post-result | ✅ Post Result | 🟡 Swagger docs outdated | 1 |
| GET / (query) | ⚠️ List Orders | 🔴 Assignment logic unclear | 2 |
| PATCH /:id/post-result (Issue B) | ✅ TestResult Retry | None (Fixed!) | - |

---

## Next Session Checklist
- [ ] Update Swagger docs for postLabResult response (30 min)
- [ ] Clarify lab tech assignment mechanism with team
- [ ] Implement explicit assignedLabTech field if needed
- [ ] Test full lab tech workflow
- [ ] Document lab tech API in frontend integration guide

---

**Report Generated:** 2026-04-18 | **Session:** Lab Tech API Analysis
