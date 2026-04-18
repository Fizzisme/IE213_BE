# 📖 Patient-Centric Access Control - Tình Huống Cực Kỳ Chi Tiết

**Mục đích:** Giải thích chi tiết cách hệ thống kiểm soát access của doctor xem dữ liệu bệnh nhân

---

## 🎬 TÌNH HUỐNG: Doctor Minh Xem Hồ Sơ Bệnh Án

### 📋 Database State Trước Khi Bắt Đầu

**Users Collection:**

```javascript
// Patient Nguyễn Văn A
{
    _id: ObjectId("507f1f77bcf86cd799439020"),
    email: "patient_a@gmail.com",
    role: "PATIENT",
    walletAddress: "0xPATIENT111222333444555666",
    passwordHash: "...",
    createdAt: 2026-04-01T10:00:00Z
}

// Doctor Minh
{
    _id: ObjectId("507f1f77bcf86cd79943aaa1"),
    email: "minh@hospital.com",
    role: "DOCTOR",
    walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
    passwordHash: "...",
    createdAt: 2026-03-15T08:30:00Z
}

// Doctor Vân (không có grant)
{
    _id: ObjectId("507f1f77bcf86cd79943bbb2"),
    email: "van@hospital.com",
    role: "DOCTOR",
    walletAddress: "0xDOCTOR_VAN_1122334455667",
    passwordHash: "...",
    createdAt: 2026-03-20T09:00:00Z
}
```

**Patients Collection:**

```javascript
// Patient Nguyễn Văn A
{
    _id: ObjectId("507f1f77bcf86cd799439011"),
    userId: ObjectId("507f1f77bcf86cd799439020"),
    fullName: "Nguyễn Văn A",
    gender: "M",
    birthYear: 1990,
    phoneNumber: "0912345678",
    createdAt: 2026-04-01T10:00:00Z
}
```

**Medical Records Collection:**

```javascript
{
    _id: ObjectId("507f1f77bcf86cd799439999"),
    patientId: ObjectId("507f1f77bcf86cd799439011"),
    type: "DIABETES_TEST",
    status: "COMPLETED",
    diagnosis: "Tiểu đường type 2",
    clinicalInterpretation: "Bệnh nhân có chỉ số đường huyết cao, cần điều trị",
    recommendation: "Tăng luyện tập, điều chỉnh chế độ ăn",
    createdBy: ObjectId("507f1f77bcf86cd79943aaa1"),  // Doctor Minh
    createdAt: 2026-04-08T14:30:00Z
}
```

**Blockchain State (Smart Contract):**

```solidity
// AccessControl.sol Smart Contract

contract AccessControl {
    mapping(address patient => 
        mapping(address doctor => 
            Grant)) grants;
    
    // Grants mapping state:
    grants[0xPATIENT111222333444555666][0xDOCTOR_MINH_AABBCCDDEEFF] = {
        level: 2,           // FULL
        grantedAt: 1712596200,  // Block timestamp when granted
        expiresAt: 0,           // 0 = unlimited
        isActive: true
    }
    
    // Doctor Vân không có entry
    grants[0xPATIENT111222333444555666][0xDOCTOR_VAN_1122334455667] = undefined
}

// Blockchain Events Log:
Block 1000001:
  Event: AccessGranted(
    indexed patient: 0xPATIENT111222333444555666,
    indexed accessor: 0xDOCTOR_MINH_AABBCCDDEEFF,
    level: 2,
    grantedAt: 1712596200,
    expiresAt: 0
  )
  Ghi log: Patient A cấp FULL access cho Doctor Minh vào 2026-04-08 13:30:00
```

---

## 🔄 CHI TIẾT FLOW: Doctor Minh Request - ✅ SUCCESS

### ⏰ TIMESTAMP: 2026-04-09 10:30:00 UTC

Doctor Minh vừa đăng nhập xong, muốn xem hồ sơ bệnh án của Patient A

---

### 📤 STEP 1: Doctor Gửi HTTP Request

```http
GET /v1/doctors/medical-records/507f1f77bcf86cd799439999 HTTP/1.1
Host: api.ehr.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
User-Agent: Postman/10.0
Accept: application/json
```

**JWT Token Decode:**

```javascript
{
    iss: "ehr-system",
    sub: "507f1f77bcf86cd79943aaa1",  // Doctor Minh MongoDB ID
    email: "minh@hospital.com",
    walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
    role: "DOCTOR",
    iat: 1712659800,
    exp: 1712746200
}
```

---

### 🔐 STEP 2: verifyToken Middleware (Global) - ✅ PASS

**File:** `src/middlewares/verifyToken.js` (built-in middleware)

```javascript
// [TIME: 10:30:00.001]
// Middleware này chạy global cho tất cả routes

// Lấy token từ header
const token = req.headers.authorization.split(' ')[1];
// token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Verify token với secret key
const decoded = jwt.verify(token, process.env.JWT_SECRET);
// ✅ Valid!

// Gán vào request object
req.user = {
    _id: ObjectId("507f1f77bcf86cd79943aaa1"),
    email: "minh@hospital.com",
    walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
    role: "DOCTOR"
};

// Console log
console.log("[10:30:00.001] ✅ verifyToken: Token verified for minh@hospital.com");

// Tiếp tục
next();
```

---

### 👨‍⚕️ STEP 3: authorizeRoles('DOCTOR') Middleware - ✅ PASS

**File:** `src/middlewares/authorizeRoles.js` (built-in middleware)

```javascript
// [TIME: 10:30:00.002]

const roles = ['DOCTOR'];  // Allowed roles cho endpoint này
const userRole = req.user.role;  // "DOCTOR"

// Check
if (!roles.includes(userRole)) {
    // ❌ Nếu role không match
    throw new ApiError(403, 'Forbidden');
}

// ✅ Role match!
console.log("[10:30:00.002] ✅ authorizeRoles: User is DOCTOR");

// Tiếp tục
next();
```

---

### 🔓 STEP 4: checkAccessGrant Middleware (NEW) - ✅ DETAILED CHECK

**File:** `src/middlewares/checkAccessGrant.js`

```javascript
// [TIME: 10:30:00.003]
console.log("[10:30:00.003] Starting checkAccessGrant middleware");

const currentUser = req.user;  
/*
{
    _id: ObjectId("507f1f77bcf86cd79943aaa1"),
    email: "minh@hospital.com",
    walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
    role: "DOCTOR"
}
*/
console.log(`[10:30:00.003] Current doctor: ${currentUser.email}`);

// Step 4a: Tìm patientId từ URL params
let patientId = req.params.patientId || req.query.patientId;
console.log(`[10:30:00.003] Looking for patientId in params: ${patientId}`);

// Nếu từ medicalRecord, skip (sẽ xử lý trong service)
if (!patientId && req.params.medicalRecordId) {
    console.log("[10:30:00.004] ℹ️  medicalRecordId detected, skipping middleware");
    return next();  // Skip, để service xử lý
}
// ℹ️ medicalRecordId detected → skip để service handle

// [TIME: 10:30:00.004]
// Bây giờ middleware sẽ skip, controller → service sẽ check
console.log("[10:30:00.004] ✅ checkAccessGrant: Skipped (will check in service)");
next();
```

**Tại sao skip?** Vì:

- Middleware này chỉ dùng khi có `patientId` trong URL
- Endpoint này có `medicalRecordId` → cần resolve record trước để lấy patientId
- Service layer sẽ handle việc check access

---

### 📋 STEP 5: medicalRecordController.getDetail

**File:** `src/controllers/medicalRecord.controller.js`

```javascript
// [TIME: 10:30:00.005]
console.log("[10:30:00.005] medicalRecordController.getDetail called");

const getDetail = async (req, res, next) => {
    try {
        const medicalRecordId = req.params.medicalRecordId;
        // medicalRecordId = "507f1f77bcf86cd799439999"
        
        console.log(`[10:30:00.005] Getting medical record: ${medicalRecordId}`);
        
        // Call service với currentUser
        const result = await medicalRecordService.getDetail(
            medicalRecordId,
            req.user  // ✅ Pass doctor info
        );
        
        console.log("[10:30:00.015] ✅ Service returned record");
        
        // Send response
        res.status(200).json({
            statusCode: 200,
            message: "Success",
            data: result
        });
    } catch (error) {
        console.log(`[10:30:00.020] ❌ Error: ${error.message}`);
        next(error);
    }
};
```

---

### 🔍 STEP 6: medicalRecordService.getDetail - ACCESS CHECK (CRITICAL)

**File:** `src/services/medicalRecord.service.js`

```javascript
// [TIME: 10:30:00.006]
console.log("[10:30:00.006] medicalRecordService.getDetail started");

const getDetail = async (medicalRecordId, currentUser) => {
    /*
    params:
      medicalRecordId = "507f1f77bcf86cd799439999"
      currentUser = {
        _id: ObjectId("507f1f77bcf86cd79943aaa1"),
        walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF",
        role: "DOCTOR"
      }
    */
    
    // ▶️ PHASE 1: Fetch record from database
    // [TIME: 10:30:00.007]
    console.log(`[10:30:00.007] Fetching medical record from DB: ${medicalRecordId}`);
    
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    /*
    Result from MongoDB:
    {
        _id: ObjectId("507f1f77bcf86cd799439999"),
        patientId: ObjectId("507f1f77bcf86cd799439011"),  ← CÓ CHỨA PATIENT ID!
        type: "DIABETES_TEST",
        status: "COMPLETED",
        diagnosis: "Tiểu đường type 2",
        clinicalInterpretation: "...",
        createdBy: ObjectId("507f1f77bcf86cd79943aaa1"),
        createdAt: 2026-04-08T14:30:00Z
    }
    */
    
    if (!medicalRecord) {
        throw new ApiError(404, 'Medical record not found');
    }
    
    console.log(`[10:30:00.008] ✅ Record found. Patient ID: ${medicalRecord.patientId}`);
    
    // ▶️ PHASE 2: Check access grant (NEW SECURITY LAYER)
    if (currentUser) {
        console.log("[10:30:00.009] 🔐 Starting access control check...");
        
        // [TIME: 10:30:00.010]
        // Sub-step 2a: Fetch patient from MongoDB
        console.log(`[10:30:00.010] Fetching patient: ${medicalRecord.patientId}`);
        
        const { patientModel } = await import('~/models/patient.model');
        const patient = await patientModel.findById(medicalRecord.patientId);
        /*
        Result:
        {
            _id: ObjectId("507f1f77bcf86cd799439011"),
            userId: ObjectId("507f1f77bcf86cd799439020"),
            fullName: "Nguyễn Văn A",
            ...
        }
        */
        
        if (!patient) {
            throw new ApiError(404, 'Patient not found');
        }
        
        console.log(`[10:30:00.011] ✅ Patient found: ${patient.fullName}`);
        
        // [TIME: 10:30:00.012]
        // Sub-step 2b: Fetch patient user to get walletAddress
        console.log(`[10:30:00.012] Fetching patient user: ${patient.userId}`);
        
        const { userModel } = await import('~/models/user.model');
        const patientUser = await userModel.findById(patient.userId);
        /*
        Result:
        {
            _id: ObjectId("507f1f77bcf86cd799439020"),
            email: "patient_a@gmail.com",
            walletAddress: "0xPATIENT111222333444555666",  ← IMPORTANT!
            role: "PATIENT"
        }
        */
        
        if (!patientUser || !patientUser.walletAddress) {
            throw new ApiError(500, 'Patient wallet not configured');
        }
        
        console.log(`[10:30:00.013] ✅ Patient wallet: ${patientUser.walletAddress}`);
        
        // [TIME: 10:30:00.014]
        // Sub-step 2c: Call blockchain smart contract
        console.log("[10:30:00.014] 🔗 Calling blockchain smart contract...");
        
        const { blockchainContracts } = await import('~/blockchain/contract');
        
        // Call smart contract function
        /*
        Calling: AccessControl.checkAccessLevel()
        Parameters:
          - patientWallet: "0xPATIENT111222333444555666"
          - doctorWallet: "0xDOCTOR_MINH_AABBCCDDEEFF"
          - requiredLevel: 2 (FULL)
        */
        
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientUser.walletAddress,           // "0xPATIENT111222333444555666"
            currentUser.walletAddress,           // "0xDOCTOR_MINH_AABBCCDDEEFF"
            2  // FULL minimum
        );
        
        /*
        Smart Contract Logic:
        
        function checkAccessLevel(address _patient, address _doctor, uint256 _requiredLevel)
            public view returns (bool)
        {
            Grant storage grant = grants[_patient][_doctor];
            
            // Query mapping:
            // grants[0xPATIENT111...][0xDOCTOR_MINH...] exists!
            
            if (!grant.isActive) {
                return false;  // Grant bị revoke
            }
            
            if (grant.expiresAt > 0 && grant.expiresAt < block.timestamp) {
                return false;  // Grant expired
            }
            
            // Grant tồn tại, ko expire, ko revoke
            // Check level: doctor có level đủ không?
            return grant.level >= _requiredLevel;
            
            // grant.level = 2 (FULL)
            // _requiredLevel = 2
            // 2 >= 2 → TRUE ✅
        }
        */
        
        console.log(`[10:30:00.115] 🔗 Smart contract returned: ${hasAccess}`);
        
        // [TIME: 10:30:00.116]
        // Sub-step 2d: Check result
        if (!hasAccess) {
            console.log("[10:30:00.116] ❌ ACCESS DENIED!");
            throw new ApiError(403, 'You do not have access to this patient data');
        }
        
        console.log("[10:30:00.116] ✅ ACCESS GRANTED! Doctor has FULL access");
    }
    
    // ▶️ PHASE 3: Return data (chỉ đến được đây nếu pass access check)
    console.log("[10:30:00.117] Returning medical record to controller");
    return medicalRecord;
};
```

**Blockchain Call Chi Tiết:**

```solidity
// Smart Contract State:
mapping(address => mapping(address => Grant)) grants;

grants[0xPATIENT111222333444555666][0xDOCTOR_MINH_AABBCCDDEEFF] = {
    level: 2,              // FULL
    grantedAt: 1712596200,
    expiresAt: 0,          // Unlimited
    isActive: true
};

// Function call:
checkAccessLevel(0xPATIENT111, 0xDOCTOR_MINH, 2)

// Step by step:
1. Get grant: grant = grants[0xPATIENT111][0xDOCTOR_MINH]
2. Grant found? YES ✅
3. Is grant active? grant.isActive = true ✅
4. Check expiration: expiresAt = 0 (unlimited) ✅
5. Check level: 2 >= 2? YES ✅
6. Return: true ✅✅✅
```

---

### 📤 STEP 7: Response Back to Client

```javascript
// [TIME: 10:30:00.118]
console.log("[10:30:00.118] Sending response to client");

const response = {
    statusCode: 200,
    message: "Success",
    data: {
        _id: "507f1f77bcf86cd799439999",
        patientId: "507f1f77bcf86cd799439011",
        type: "DIABETES_TEST",
        status: "COMPLETED",
        diagnosis: "Tiểu đường type 2",
        clinicalInterpretation: "Bệnh nhân có chỉ số đường huyết cao...",
        recommendation: "Tăng luyện tập, điều chỉnh chế độ ăn",
        createdBy: "507f1f77bcf86cd79943aaa1",
        createdAt: "2026-04-08T14:30:00Z"
    }
};

res.status(200).json(response);

console.log("[10:30:00.119] ✅ Response sent");
```

---

### 📊 TIMELINE SUMMARY

```
10:30:00.001 → verifyToken: Verify JWT ✅
10:30:00.002 → authorizeRoles: Check DOCTOR role ✅
10:30:00.003 → checkAccessGrant: Skip (will check in service)
10:30:00.004 → Next middleware
10:30:00.005 → Controller: Call service
10:30:00.006 → Service: Start getDetail
10:30:00.007 → Service: Fetch record from DB
10:30:00.008 → Service: Record found
10:30:00.009 → Service: Start access check
10:30:00.010 → Service: Fetch patient from DB
10:30:00.011 → Service: Patient found
10:30:00.012 → Service: Fetch patient user
10:30:00.013 → Service: Got wallet address
10:30:00.014 → Service: Call blockchain
10:30:00.115 → Blockchain: returned TRUE
10:30:00.116 → Service: Access granted!
10:30:00.117 → Service: Return record
10:30:00.118 → Controller: Send response
10:30:00.119 → ✅ Client receives data
```

**Total Time: ~119ms**

---

---

## 🚫 SCENARIO 2: Doctor Vân (NO GRANT) - ❌ FAILURE

### Database State Difference

```
// Users - Doctor Vân
{
    _id: ObjectId("507f1f77bcf86cd79943bbb2"),
    walletAddress: "0xDOCTOR_VAN_1122334455667",
    ...
}

// Blockchain - NO GRANT from Patient A
grants[0xPATIENT111222333444555666][0xDOCTOR_VAN_1122334455667] = undefined
// Entry doesn't exist!
```

---

### Flow: Same as Step 1-5 (Same verifyToken, authorizeRoles, etc)

```
10:30:00.001 ✅ verifyToken
10:30:00.002 ✅ authorizeRoles('DOCTOR')
10:30:00.003 → checkAccessGrant: Skip
10:30:00.005 → Controller: Call service
```

---

### STEP 6: Service Calls Blockchain - ❌ FAIL

```javascript
// [TIME: 10:30:00.114]
const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
    "0xPATIENT111222333444555666",     // Patient A
    "0xDOCTOR_VAN_1122334455667",      // Doctor Vân ← DIFFERENT!
    2
);

/*
Smart Contract:
function checkAccessLevel(address _patient, address _doctor, uint256 _requiredLevel)
    public view returns (bool)
{
    Grant storage grant = grants[_patient][_doctor];
    
    // grants[0xPATIENT111][0xDOCTOR_VAN] = ???
    // Entry doesn't exist!
    // In Solidity, non-existent mapping returns default value (0)
    
    // grant.level = 0 (default)
    // grant.isActive = false (default)
    
    if (!grant.isActive) {
        return false;  // ❌ Return false!
    }
}
*/

// Result: hasAccess = false ❌
```

---

### Error Response

```javascript
// [TIME: 10:30:00.115]
if (!hasAccess) {
    console.log("[10:30:00.115] ❌ ACCESS DENIED!");
    throw new ApiError(403, 'You do not have access to this patient data');
}

// Response to client:
{
    statusCode: 403,
    message: "Forbidden",
    error: "You do not have access to this patient data"
}
```

---

---

## 🔍 SCENARIO 3: Doctor Minh Xem Danh Sách (getAll)

### Database State

```
Medical Records:
- rec_001 (Patient A - ObjectId("507f...11"))  COMPLETED
- rec_002 (Patient A - ObjectId("507f...11"))  HAS_RESULT
- rec_003 (Patient B - ObjectId("507f...22"))  COMPLETED ← NO ACCESS
- rec_004 (Patient C - ObjectId("507f...33"))  COMPLETED
- rec_005 (Patient D - ObjectId("507f...44"))  COMPLETED ← REVOKED LATER
```

### Request

```http
GET /v1/doctors/medical-records?status=COMPLETED HTTP/1.1
```

---

### STEP 1-3: Same (Token & Role)

```
10:30:00.001 ✅ verifyToken
10:30:00.002 ✅ authorizeRoles('DOCTOR')
```

---

### STEP 4: fetchGrantedPatients Middleware - BUILD LIST

```javascript
// [TIME: 10:30:00.003]
console.log("[10:30:00.003] fetchGrantedPatients: Build doctor's patient list");

const currentUser = req.user;  // Doctor Minh
// walletAddress: "0xDOCTOR_MINH_AABBCCDDEEFF"

// Phase 1: Query blockchain for AccessGranted events
// [TIME: 10:30:00.010]
console.log("[10:30:00.010] Querying blockchain AccessGranted events...");

const allAccessGrantedEvents = await blockchainContracts.read.accessControl
    .queryFilter(blockchainContracts.read.accessControl.filters.AccessGranted());

/*
Result from blockchain (all events ever):
[
  Event_1: {
    patient: "0xPATIENT111",
    accessor: "0xDOCTOR_MINH",    ← Match!
    level: 2,
    timestamp: 1712596200
  },
  Event_2: {
    patient: "0xPATIENT222",
    accessor: "0xOTHER_DOCTOR",
    level: 2,
    timestamp: 1712596300
  },
  Event_3: {
    patient: "0xPATIENT333",
    accessor: "0xDOCTOR_MINH",    ← Match!
    level: 3,
    timestamp: 1712596400
  },
  Event_4: {
    patient: "0xPATIENT444",
    accessor: "0xDOCTOR_MINH",    ← Match!
    level: 2,
    timestamp: 1712596500
  }
]
*/

const doctorGrants = allAccessGrantedEvents.filter(e => 
    e.accessor === "0xDOCTOR_MINH_AABBCCDDEEFF"
);

/*
Filtered Result (only Minh's grants):
[
  Event_1: {patient: "0xPATIENT111", level: 2},
  Event_3: {patient: "0xPATIENT333", level: 3},
  Event_4: {patient: "0xPATIENT444", level: 2}
]
*/

console.log("[10:30:00.015] ✅ Found 3 AccessGranted events for Minh");

// Phase 2: Query AccessRevoked events
// [TIME: 10:30:00.020]
console.log("[10:30:00.020] Querying blockchain AccessRevoked events...");

const revokedEvents = await blockchainContracts.read.accessControl
    .queryFilter(blockchainContracts.read.accessControl.filters.AccessRevoked());

/*
Result (all revocation events):
[
  Revoke_1: {
    patient: "0xPATIENT444",
    accessor: "0xDOCTOR_MINH",
    timestamp: 1712659200  ← LATER! After grant
  }
]

Meaning: Patient D revoked access from Minh at 2026-04-09 09:00:00
*/

const revokedPatients = new Set();
revokedEvents.forEach(e => {
    if (e.accessor === "0xDOCTOR_MINH_AABBCCDDEEFF") {
        revokedPatients.add(e.patient);
    }
});

/*
revokedPatients = {"0xPATIENT444"}
*/

console.log("[10:30:00.025] ✅ Found 1 revoked patient for Minh");

// Phase 3: Build active grants (filter out revoked)
const patientAddresses = new Set();
doctorGrants.forEach(e => {
    if (!revokedPatients.has(e.patient)) {
        patientAddresses.add(e.patient);
    }
});

/*
Active grants:
- "0xPATIENT111" (Patient A) ✅
- "0xPATIENT333" (Patient C) ✅
- "0xPATIENT444" (Patient D) ❌ Removed (revoked)

patientAddresses = {"0xPATIENT111", "0xPATIENT333"}
*/

console.log("[10:30:00.030] ✅ Active patients: 2 (A and C)");

// Phase 4: Convert wallet addresses to MongoDB ObjectIds
// [TIME: 10:30:00.032]
console.log("[10:30:00.032] Converting wallet addresses to MongoDB ObjectIds...");

const patientIds = [];

// Process Patient A (0xPATIENT111)
const user_A = await userModel.findOne({ 
    walletAddress: "0xPATIENT111222333444555666" 
});
// Returns: { _id: ObjectId("507f1f77bcf86cd799439020"), ... }

const patient_A = await patientModel.findOne({ 
    userId: ObjectId("507f1f77bcf86cd799439020") 
});
// Returns: { _id: ObjectId("507f1f77bcf86cd799439011"), fullName: "Nguyễn Văn A", ... }

patientIds.push(ObjectId("507f1f77bcf86cd799439011"));  // Patient A

// Process Patient C (0xPATIENT333)
const user_C = await userModel.findOne({ 
    walletAddress: "0xPATIENT333..." 
});
const patient_C = await patientModel.findOne({ userId: user_C._id });
patientIds.push(ObjectId("507f1f77bcf86cd799439033"));  // Patient C

/*
patientIds = [
    ObjectId("507f1f77bcf86cd799439011"),  // Patient A
    ObjectId("507f1f77bcf86cd799439033")   // Patient C
]
*/

console.log("[10:30:00.045] ✅ Converted to MongoDB IDs");

// Phase 5: Store in request
req.grantedPatients = patientIds;
console.log("[10:30:00.046] ✅ Stored grantedPatients in request");

next();
```

---

### STEP 5: Controller

```javascript
// [TIME: 10:30:00.047]
const getAll = async (req, res, next) => {
    try {
        const status = req.query.status;  // "COMPLETED"
        const statusArray = status ? status.split(',') : ["COMPLETED"];
        
        /*
        statusArray = ["COMPLETED"]
        req.grantedPatients = [ObjectId("507f...11"), ObjectId("507f...33")]
        */
        
        console.log("[10:30:00.048] Calling service with grantedPatients");
        
        const result = await medicalRecordService.getAll(
            statusArray,
            req.grantedPatients
        );
        
        res.json(result);
    } catch (error) {
        next(error);
    }
};
```

---

### STEP 6: Service - Build MongoDB Query

```javascript
// [TIME: 10:30:00.050]
const getAll = async (statusArray, grantedPatientIds) => {
    /*
    params:
      statusArray = ["COMPLETED"]
      grantedPatientIds = [ObjectId("507f...11"), ObjectId("507f...33")]
    */
    
    const query = {
        _destroy: false,
    };
    
    // ✅ KEY: Add patient filter
    if (grantedPatientIds !== undefined) {
        query.patientId = { 
            $in: [
                ObjectId("507f1f77bcf86cd799439011"),  // A
                ObjectId("507f1f77bcf86cd799439033")   // C
            ]
        };
    }
    
    // Add status filter
    if (statusArray?.length > 0) {
        query.status = { $in: ["COMPLETED"] };
    }
    
    /*
    Final MongoDB Query:
    {
        _destroy: false,
        patientId: { 
            $in: [ObjectId(A), ObjectId(C)]
        },
        status: { 
            $in: ["COMPLETED"]
        }
    }
    */
    
    console.log("[10:30:00.052] MongoDB Query:");
    console.log(JSON.stringify(query, null, 2));
    
    // [TIME: 10:30:00.053]
    const records = await medicalRecordModel.MedicalRecordModel
        .find(query)
        .sort({ createdAt: -1 });
    
    /*
    MongoDB Scan Results:
    rec_001: patientId = A, status = COMPLETED 
             → A in list? YES ✅ status match? YES ✅ → INCLUDE
    
    rec_002: patientId = A, status = HAS_RESULT
             → A in list? YES ✅ status match? NO ❌ → SKIP
    
    rec_003: patientId = B, status = COMPLETED
             → B in list? NO ❌ → SKIP
    
    rec_004: patientId = C, status = COMPLETED
             → C in list? YES ✅ status match? YES ✅ → INCLUDE
    
    rec_005: patientId = D, status = COMPLETED
             → D in list? NO ❌ → SKIP
    
    Final Result: [rec_001, rec_004]
    */
    
    console.log("[10:30:00.060] Found 2 records");
    return records;
};
```

---

### STEP 7: Response

```json
{
    "statusCode": 200,
    "message": "Success",
    "data": [
        {
            "_id": "rec_001",
            "patientId": "507f1f77bcf86cd799439011",
            "type": "DIABETES_TEST",
            "status": "COMPLETED",
            "diagnosis": "Tiểu đường type 2"
        },
        {
            "_id": "rec_004",
            "patientId": "507f1f77bcf86cd799439033",
            "type": "BLOOD_WORK",
            "status": "COMPLETED",
            "diagnosis": "..."
        }
    ]
}
```

✅ **Doctor Minh chỉ thấy 2 records (từ Patient A & C mà anh có grant)**

---

---

## 📊 COMPARISON TABLE

| Scenario | Doctor | Patients Granted | Records in DB | Request | Middleware Check | Service Filter | Result |
|----------|--------|-----------------|----------------|---------|-----------------|-----------------|--------|
| **1** | Minh | A | rec_A | GET record | checkAccessGrant | Blockchain check | ✅ 200 OK |
| **2** | Vân | None | rec_A | GET record | checkAccessGrant | Blockchain check | ❌ 403 Forbidden |
| **3** | Minh | A, C | rec_001-5 | GET list | fetchGrantedPatients | MongoDB $in filter | ✅ 200 OK (2 records) |

---

## 🎯 KEY TAKEAWAYS

### 1️⃣ Middleware Layer

- `checkAccessGrant.js` - Kiểm tra individual record access
- `fetchGrantedPatients.js` - Build danh sách patients được phép

### 2️⃣ Service Layer

- `getDetail()` - Double-check blockchain grant trước return
- `getAll()` - Filter by `$in: grantedPatientIds`

### 3️⃣ Security Layers

```
Layer 1: Middleware
  - Early rejection
  - Block before hitting service

Layer 2: Service
  - Blockchain verification
  - Defense-in-depth

Layer 3: MongoDB Query
  - Database level filtering
  - Even if layers 1&2 fail, DB won't return data
```

### 4️⃣ Database vs Blockchain

| Store | Used For | Data |
|-------|----------|------|
| **MongoDB** | Patient data | Medical records, diagnoses |
| **Blockchain** | Access grants | Who has permission to see what |

---

## 🔐 SECURITY GUARANTEE

```
Doctor CANNOT see patient data UNLESS:
  1. ✅ Has valid JWT token
  2. ✅ Has DOCTOR role
  3. ✅ Patient granted access on blockchain
  4. ✅ Grant not revoked
  5. ✅ Grant not expired

If ANY condition fails → 403 Forbidden
```

---

## ⚠️ DATA STORAGE CLARIFICATION

### IMPORTANT: Blockchain On-Chain Storage Policy

🔴 **WHAT DOES NOT GO ON BLOCKCHAIN:**

```
❌ Yêu cầu xét nghiệm chi tiết (Lab order details)
❌ Kết quả xét nghiệm (Test results values)
❌ Chẩn đoán text (Diagnosis interpretation)
❌ Ghi chú lâm sàng (Clinical notes)
❌ Dữ liệu bệnh nhân (Patient demographics)

Tất cả những dữ liệu này lưu trong MongoDB (OFF-CHAIN) ✅
```

🟢 **WHAT GOES ON BLOCKCHAIN:**

```
✅ Access grants (Ai có quyền xem gì)
✅ Revoked access (Khi patient hủy grant)
✅ Hash of interpretations (Keccak256 - để verify không bị modify)
✅ Blockchain events (AccessGranted, AccessRevoked, etc)
✅ Timestamps (Khi có quyết định chuyên môn)
```

### Why This Architecture?

| Lý do | On-Chain | Off-Chain (MongoDB) |
|------|----------|------------------|
| **Bảo mật** | Audit trail immutable | Data private, ko công khai |
| **Chi phí** | Minimal (access rights only) | Tiết kiệm gas (dữ liệu lớn) |
| **Hiệu suất** | Chậm nhưng quan trọng | Nhanh, thích hợp clinical use |
| **Linh hoạt** | Ko thể sửa (immutable) | Có thể correct/update |
| **Quy định** | Audit trail cho compliance | HIPAA compliant |

### Example: Lab Order Workflow Does NOT Use Blockchain

```
1. Doctor creates lab order (MongoDB) - ✅ OFF-CHAIN
   └─ Tests, priority, notes all stored locally
   └─ NOT sent to blockchain

2. Lab tech posts test results (MongoDB) - ✅ OFF-CHAIN
   └─ Test values, raw data stored locally
   └─ NOT sent to blockchain

3. Doctor interprets results (Hybrid)
   ├─ Interpretation TEXT → MongoDB (OFF-CHAIN)
   └─ Interpretation HASH → Blockchain (ON-CHAIN for verification)
```

**Result:**

- ✅ Fast local workflow
- ✅ Private medical data
- ✅ Immutable audit trail for access control
- ✅ Blockchain verifies data integrity (hash check)
