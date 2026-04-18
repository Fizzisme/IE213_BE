# 🔐 Access Control Workflow - Chi Tiết Triển Khai Frontend & Backend

## Tình Huống: Bệnh nhân cấp quyền cho Doctor

---

## 1️⃣ BUG/VẤN ĐỀ HIỆN TẠI

### ❌ API Hiện Tại (Đơn Giản Quá)

```json
POST /v1/access-control/grant
Body:
{
  "granteeAddress": "0x8626f6940E2eb28930DF29938e02EE2e60f64fc5",
  "recordId": "65f1a2b3c4d5e6f789012345",
  "accessLevel": "READ_RESULTS"
}
```

### ❓ Vấn đề

1. **Frontend biết được `granteeAddress` từ đâu?**
   - User không thể tìm doctor address ngẫu nhiên
   - Cần có cơ chế tìm kiếm doctor

2. **Metamask làm gì?**
   - Nếu chỉ POST request bình thường → không cần Metamask
   - Nhưng workflow on-chain thì cần signature

3. **Blockchain xác minh gì?**
   - Ghi vào smart contract ai cấp quyền cho ai
   - Chứng minh đó là patient chữ ký (EIP-191)

---

## ✅ GIẢI PHÁP: FULL WORKFLOW

### 🔄 FLOW CHI TIẾT (7 bước)

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Web App)                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 1: Bệnh nhân tìm kiếm Doctor                     │
│  ├─ Input: Doctor name "Dr. Minh"                      │
│  └─ GET /v1/doctors/search?name=Minh                   │
│     └─ Response: Doctor list + wallet addresses       │
│                                                         │
│  Step 2: Chọn Doctor → Metamask Connect                │
│  ├─ User click "Grant Access to Dr. Minh"             │
│  ├─ Frontend call: window.ethereum.request({...})     │
│  └─ Metamask pop-up: "Connect wallet?"                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                  METAMASK (Browser Extension)           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 3: Metamask Gets Message to Sign                 │
│  ├─ Message: "Grant READ_RESULTS to Dr. at 0x862...   │
│  │           For Record: 65f1a2b3c4d5e6f789012345    │
│  │           Expires: 2026-05-08"                      │
│  └─ User click "Sign" in Metamask                      │
│                                                         │
│  Step 4: Metamask Signs with User's Private Key        │
│  ├─ Format: EIP-191 signed message                     │
│  ├─ Signature: 0x1234567890abcdef...                   │
│  └─ Return to Frontend                                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                  FRONTEND (Web App)                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 5: Frontend Sends Signed Message to Backend      │
│  └─ POST /v1/access-control/grant (with signature)     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│              BACKEND (Express + Blockchain)             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 6: Backend Verifies Signature                    │
│  ├─ Recover wallet address from signature              │
│  ├─ Check: Recovered address == Patient wallet?        │
│  ├─ Check: JWT token's wallet == recovered wallet?     │
│  └─ Result: ✅ Signature valid = authentic request    │
│                                                         │
│  Step 7: Backend Send to Blockchain                    │
│  ├─ Call AccessControl.sol contract                    │
│  ├─ grantAccess(patientAddress, doctorAddress, ...)   │
│  ├─ Tx hash: 0xabc123...                               │
│  └─ Save to MongoDB + blockchain record                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 2️⃣ STEP-BY-STEP IMPLEMENTATION

### CLIENT SIDE (Frontend - React/Vue)

#### Step 1: Search Doctor by Name

```javascript
// Frontend - patients/GrantAccess.tsx

async function searchDoctor(searchTerm) {
  const response = await fetch(
    `http://localhost:8017/v1/doctors/search?name=${searchTerm}`
  );
  
  const data = await response.json();
  // Response:
  // {
  //   "statusCode": 200,
  //   "data": [
  //     {
  //       "_id": "doctor_id_1",
  //       "fullName": "Dr. Minh",
  //       "walletAddress": "0x8626f6940E2eb28930DF29938e02EE2e60f64fc5",
  //       "specialization": "Endocrinology"
  //     }
  //   ]
  // }
  
  return data.data; // Return doctor list
}

// Display: Show list of doctors with "Grant Access" button
```

#### Step 2: User Selects Doctor & Clicks Grant Button

```javascript
async function handleGrantAccess(selectedDoctor, recordId) {
  // selectedDoctor = { walletAddress: "0x862...", fullName: "Dr. Minh" }
  
  // Connect to Metamask if not already connected
  const [userAccount] = await window.ethereum.request({
    method: "eth_requestAccounts"
  });
  // userAccount = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  
  // Prepare message to sign
  const message = formatGrantMessage({
    doctorAddress: selectedDoctor.walletAddress,
    recordId: recordId,
    accessLevel: "READ_RESULTS",
    expiryDate: new Date(Date.now() + 30*24*60*60*1000) // 30 days
  });
  
  // Message content (human readable):
  // "Grant READ_RESULTS access to doctor at address 0x862...
  //  For medical record: 65f1a2b3c4d5e6f789012345
  //  Valid until: 2026-05-08
  //  Chain ID: 11155111 (Sepolia)
  //  Timestamp: 1712576123"
}
```

#### Step 3: Sign Message with Metamask

```javascript
async function signGrantMessage(message) {
  // This pops up Metamask UI asking user to sign
  
  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, userAccount] // EIP-191 signature
  });
  
  // Result: signature = "0x1234567890abcdef..."
  // This proves the message was signed by userAccount's private key
  
  return signature;
}

// ⚠️ KEY POINT: User SEES the exact message they're signing
// Metamask shows: "Sign this message? [full message text]"
```

#### Step 4: Send Signed Grant to Backend

```javascript
async function grantAccessToDoctor(doctorAddress, recordId, signature) {
  const response = await fetch(
    "http://localhost:8017/v1/access-control/grant",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`, // Patient's JWT token
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        granteeAddress: doctorAddress,         // "0x862..."
        recordId: recordId,                    // MongoDB ID
        accessLevel: "READ_RESULTS",           // enum
        expiryDate: "2026-05-08",
        signature: signature,                  // "0x1234..." from Metamask
        message: originalMessage               // Original message that was signed
      })
    }
  );
  
  const data = await response.json();
  // {
  //   "statusCode": 201,
  //   "message": "Access granted successfully",
  //   "data": {
  //     "_id": "grant_id_here",
  //     "status": "ACTIVE",
  //     "blockchainTxHash": "0xabc123...",
  //     "grantedAt": "2026-04-08T10:30:00Z"
  //   }
  // }
}
```

---

### SERVER SIDE (Backend - Express)

#### Step 1: Search Doctor Endpoint

```javascript
// src/routes/v1/doctor.route.js

router.get('/search', authMiddleware, async (req, res) => {
  const { name } = req.query;
  
  // Find doctors by name
  const doctors = await Doctor.find({
    fullName: { $regex: name, $options: 'i' }
  }).select('_id fullName walletAddress specialization phone');
  
  res.json({
    statusCode: 200,
    data: doctors
  });
});
```

#### Step 2: Verify Signature & Grant Access

```javascript
// src/controllers/accessControl.controller.js
const ethers = require('ethers');

async function grantAccess(req, res) {
  try {
    // Extract from request
    const { granteeAddress, recordId, accessLevel, expiryDate, signature, message } = req.body;
    const patientToken = req.user; // From JWT middleware
    const patientWallet = patientToken.walletAddress; // "0x709..."
    
    // ⭐ STEP 1: Verify Signature (Recover signer address)
    // This proves the message was signed by patient's private key
    
    const recoveredAddress = ethers.utils.verifyMessage(
      message,  // Original message
      signature // Signature from Metamask
    );
    
    console.log(`Message signed by: ${recoveredAddress}`);
    console.log(`Patient wallet: ${patientWallet}`);
    
    // Check: Recovered address matches patient's wallet address
    if (recoveredAddress.toLowerCase() !== patientWallet.toLowerCase()) {
      return res.status(401).json({
        statusCode: 401,
        error: "Invalid signature - signer must be the patient"
      });
    }
    // ✅ Signature verified = This is authentic request from patient
    
    // ⭐ STEP 2: Validate inputs
    
    if (!ethers.utils.isAddress(granteeAddress)) {
      return res.status(400).json({
        error: "Invalid doctor wallet address"
      });
    }
    
    if (new Date(expiryDate) <= new Date()) {
      return res.status(400).json({
        error: "Expiry date must be in future"
      });
    }
    
    // ⭐ STEP 3: Save to MongoDB
    
    const accessGrant = new AccessGrant({
      patientAddress: patientWallet,
      granteeAddress: granteeAddress,
      recordId: recordId,
      accessLevel: accessLevel,
      expiryDate: expiryDate,
      status: "PENDING_BLOCKCHAIN",
      messageHash: ethers.utils.hashMessage(message),
      signatureUsed: signature,
      createdAt: new Date()
    });
    
    await accessGrant.save();
    
    // ⭐ STEP 4: Send to Blockchain (AccessControl.sol)
    
    const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
    
    const contract = new ethers.Contract(
      ACCESS_CONTROL_ADDRESS,
      ACCESS_CONTROL_ABI,
      wallet
    );
    
    // Call smart contract function
    // grantAccess(patientAddress, doctorAddress, recordId, accessLevel, expiryDate, messageHash)
    
    const tx = await contract.grantAccess(
      patientWallet,           // who is granting
      granteeAddress,          // who gets access
      recordId,                // which record
      accessLevel,             // what level
      new Date(expiryDate).getTime() / 1000,  // expire when
      accessGrant.messageHash  // proof of intent
    );
    
    // Wait for tx to be mined
    const receipt = await tx.wait();
    
    // Update MongoDB with blockchain proof
    accessGrant.blockchainTxHash = tx.hash;
    accessGrant.blockchainRecordId = receipt.events[0].args.grantId;
    accessGrant.status = "ACTIVE";
    await accessGrant.save();
    
    // ✅ Success response
    res.status(201).json({
      statusCode: 201,
      message: "Access granted successfully",
      data: {
        _id: accessGrant._id,
        status: "ACTIVE",
        blockchainTxHash: tx.hash,
        grantedAt: accessGrant.createdAt
      }
    });
    
  } catch (error) {
    console.error("Grant access error:", error);
    res.status(500).json({
      error: "Failed to grant access",
      details: error.message
    });
  }
}

module.exports = { grantAccess };
```

#### Step 3: Create Endpoint for Doctor to Use Grant

```javascript
// src/routes/v1/accessControl.route.js

router.get('/my-grants', authMiddleware, async (req, res) => {
  // Doctor can see all grants given to them
  const doctorWallet = req.user.walletAddress;
  
  const grants = await AccessGrant.find({
    granteeAddress: doctorWallet,
    status: "ACTIVE",
    expiryDate: { $gt: new Date() }
  });
  
  res.json({
    statusCode: 200,
    data: grants
  });
});

// Doctor can now access patient records using these grants
router.get('/patient/:patientAddress/records', authMiddleware, async (req, res) => {
  const doctorWallet = req.user.walletAddress;
  const patientAddress = req.params.patientAddress;
  
  // Check if doctor has valid grant
  const grant = await AccessGrant.findOne({
    patientAddress: patientAddress,
    granteeAddress: doctorWallet,
    status: "ACTIVE",
    expiryDate: { $gt: new Date() }
  });
  
  if (!grant) {
    return res.status(403).json({
      error: "No access to this patient's records"
    });
  }
  
  // Return patient records (based on grant.accessLevel)
  const records = await MedicalRecord.find({
    patientId: patientAddress
  });
  
  res.json({
    statusCode: 200,
    data: records,
    grantId: grant._id
  });
});
```

---

## 3️⃣ SMART CONTRACT (Solidity)

```solidity
// contracts/AccessControl.sol

pragma solidity ^0.8.0;

contract AccessControl {
  
  struct AccessGrant {
    uint256 grantId;
    address patient;
    address grantee;        // Doctor wallet
    string recordId;        // MongoDB record ID
    string accessLevel;     // "READ_RESULTS", "READ_ALL", etc.
    uint256 expiryDate;
    bytes32 messageHash;    // Hash of patient's signed message
    bool revoked;
    uint256 grantedAt;
  }
  
  mapping(bytes32 => AccessGrant) public grants;
  uint256 public nextGrantId = 1;
  
  event AccessGranted(
    uint256 indexed grantId,
    address indexed patient,
    address indexed grantee,
    string recordId,
    uint256 expiryDate
  );
  
  // Called by backend (with patient's signature verified)
  function grantAccess(
    address patient,
    address doctor,
    string calldata recordId,
    string calldata accessLevel,
    uint256 expiryDate,
    bytes32 messageHash
  ) external returns (uint256 grantId) {
    
    // Backend must verify: signer of messageHash == patient
    
    grantId = nextGrantId++;
    
    AccessGrant storage grant = grants[keccak256(abi.encode(grantId))];
    grant.grantId = grantId;
    grant.patient = patient;
    grant.grantee = doctor;
    grant.recordId = recordId;
    grant.accessLevel = accessLevel;
    grant.expiryDate = expiryDate;
    grant.messageHash = messageHash;
    grant.revoked = false;
    grant.grantedAt = block.timestamp;
    
    emit AccessGranted(grantId, patient, doctor, recordId, expiryDate);
  }
  
  // Called by patient to revoke access
  function revokeAccess(uint256 grantId) external {
    bytes32 key = keccak256(abi.encode(grantId));
    AccessGrant storage grant = grants[key];
    
    require(msg.sender == grant.patient, "Only patient can revoke");
    grant.revoked = true;
  }
  
  // Anyone can check if access is valid
  function hasAccess(
    address patient,
    address doctor,
    uint256 grantId
  ) external view returns (bool) {
    bytes32 key = keccak256(abi.encode(grantId));
    AccessGrant memory grant = grants[key];
    
    return !grant.revoked && 
           grant.patient == patient &&
           grant.grantee == doctor &&
           block.timestamp <= grant.expiryDate;
  }
}
```

---

## 4️⃣ SECURITY - WHY THIS WORKS

### 🔒 Signature Verification Flow

```
┌─────────────────────────────────────────────────┐
│         PATIENT CLICKS "SIGN" IN METAMASK       │
├─────────────────────────────────────────────────┤
│                                                 │
│  Message to sign:                              │
│  "Grant READ_RESULTS access to doctor..."     │
│                                                 │
│  Metamask uses patient's PRIVATE KEY to sign   │
│  (Private key NEVER leaves Metamask)           │
│                                                 │
│  Returns: Signature (mathematical proof)       │
│                                                 │
└─────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────┐
│    FRONTEND SENDS TO BACKEND WITH SIGNATURE     │
├─────────────────────────────────────────────────┤
│                                                 │
│  POST /v1/access-control/grant                 │
│  {                                              │
│    "message": "Grant READ_RESULTS...",         │
│    "signature": "0x1234567890abcdef...",       │
│    "granteeAddress": "0x862..."                │
│  }                                              │
│                                                 │
└─────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────┐
│      BACKEND VERIFIES SIGNATURE                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  recoveredAddress = verify(message, signature) │
│                    = "0x709..."                 │
│                                                 │
│  ✅ If recovered address == Patient wallet     │
│     → Request is authentic ✅                  │
│                                                 │
│  ❌ If recovered address != Patient wallet     │
│     → Someone else tried to grant access ❌   │
│                                                 │
│  ❌ If signature is forged                     │
│     → Math won't work, recovery fails ❌       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### ✅ Why This Prevents Attack

**Attack 1: Hacker intercepts request**

- ❌ Fails: Hacker doesn't have patient's signature

**Attack 2: Hacker modifies granteeAddress**

- 🔐 Protected: JWT token + wallet verification

**Attack 3: Doctor impersonates patient**

- ❌ Fails: Doctor doesn't have patient's private key

**Attack 4: Man-in-middle changes message**

- ❌ Fails: Signature won't verify for modified message

---

## 📊 COMPLETE API ENDPOINTS NEEDED

### Patient APIs (with Auth)

```
1. GET  /v1/doctors/search?name=...          // Find doctors to grant access
2. POST /v1/access-control/grant             // Grant access (with signature)
3. GET  /v1/access-control/my-grants         // See grants I gave
4. PATCH /v1/access-control/revoke/:grantId  // Revoke access
```

### Doctor APIs (with Auth)

```
1. GET  /v1/access-control/my-grants         // See grants I received from patients
2. GET  /v1/access-control/patient/:patientAddress/records
3. POST /v1/access-control/check             // Verify I have access
```

### Public APIs (no auth)

```
1. POST /v1/access-control/verify            // Anyone can verify grant on blockchain
```

---

## 🚀 FRONTEND LIBRARY (React Example)

```javascript
// hooks/useMetamask.js

export function useMetamaskGrantAccess() {
  
  const grantAccessToDoctor = async (doctorAddress, recordId) => {
    
    // 1. Connect wallet
    const [userAccount] = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    
    // 2. Prepare message
    const date = new Date(Date.now() + 30*24*60*60*1000);
    const message = `
Grant medical record access

Patient Address: ${userAccount}
Doctor Address: ${doctorAddress}
Record ID: ${recordId}
Access Level: READ_RESULTS
Expires: ${date.toISOString()}
Chain: Sepolia Testnet
Timestamp: ${Date.now()}

By signing this, you authorize the doctor to access your medical records.
This action is non-reversible on-chain.
    `.trim();
    
    // 3. Sign message (pops up Metamask UI)
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [message, userAccount]
    });
    
    // 4. Send to backend
    const response = await fetch(
      "http://localhost:8017/v1/access-control/grant",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          granteeAddress: doctorAddress,
          recordId: recordId,
          accessLevel: "READ_RESULTS",
          expiryDate: date.toISOString().split('T')[0],
          signature: signature,
          message: message
        })
      }
    );
    
    const data = await response.json();
    
    if (data.statusCode === 201) {
      console.log("✅ Access granted!");
      console.log("Blockchain Tx:", data.data.blockchainTxHash);
      return data.data;
    } else {
      throw new Error(data.error);
    }
  };
  
  return { grantAccessToDoctor };
}
```

---

## 📝 TÓM TẮT

| Bước | Thực Hiện Bởi | Mục Đích |
|------|---------------|---------|
| 1 | Frontend | Tìm kiếm doctor |
| 2 | Patient (User) | Click "Grant Access" |
| 3 | Metamask | Pop-up sign message |
| 4 | Frontend | Gửi signed message đến backend |
| 5 | Backend | Verify signature = authentic request |
| 6 | Backend | Call smart contract trên blockchain |
| 7 | Doctor | Xem grants + truy cập records |

**Metamask chỉ đơn giản là:** Giữ private key của user + sign message khi user yêu cầu. Đó là nó.
