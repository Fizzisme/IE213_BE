# 📄 Smart Contract Integration Reference

**For:** Frontend developers integrating with smart contracts  
**Network:** Sepolia Testnet (Chain ID: 11155111)

---

## 🏆 Contract Overview

### AccessControl.sol

**Purpose:** Manage which doctors/staff can access patient medical records

**Key Functions:**

```solidity
// Patient grants doctor access to records
function grantAccess(
  address accessor,        // Doctor's wallet address
  AccessLevel level,       // FULL(2) or SENSITIVE(3)
  uint64 durationHours     // 0 = permanent, >0 = expires
) external onlyPatient(msg.sender)

// Check if doctor has access
function hasAccess(
  address patient,         // Patient's wallet
  address accessor,        // Doctor's wallet
  AccessLevel level        // Access level to check
) external view returns (bool)

// Patient revokes access
function revokeAccess(
  address accessor         // Doctor's wallet
) external onlyPatient(msg.sender)
```

**Error Codes:**

| Error Code | Meaning | Fix |
|-----------|---------|-----|
| `0x82511378` | NotAPatient() | Caller is not registered patient |
| `0xb22f0f3f` | AlreadyHasAccess() | Accessor already has active access |
| `0xc1ab6dc1` | NoAccess() | Accessor doesn't have permission |
| `0xdeadbeef` | ExpiredAccess() | Access period has expired |

**Frontend Integration:**

```javascript
// Check if doctor has access before loading records
const contract = new ethers.Contract(
  ACCESSCONTROL_ADDRESS,
  AccessControlABI,
  provider
);

const hasAccess = await contract.hasAccess(
  patientAddress,
  doctorAddress,
  2  // FULL access
);

if (!hasAccess) {
  console.log('Doctor does not have access');
  // Show error before data loading
}
```

---

### AccountManager.sol

**Purpose:** Manage user accounts and roles on blockchain

**Key Functions:**

```solidity
// Register new account (called by backend)
function createAccount(
  address accountAddress,
  AccountRole role         // PATIENT=1, DOCTOR=2, LAB_TECH=3, ADMIN=4
) external onlyAdmin

// Get account details
function getAccount(
  address accountAddress
) external view returns (Account)

// Account status (active/inactive/suspended)
enum AccountStatus {
  INACTIVE,    // 0 - Just created, not verified
  ACTIVE,      // 1 - Verified and can use
  SUSPENDED,   // 2 - Temporary suspension
  REVOKED      // 3 - Permanent ban
}
```

**Account Structure:**

```javascript
interface Account {
  address: string;              // Wallet address
  role: number;                 // 1=PATIENT, 2=DOCTOR, 3=LAB_TECH, 4=ADMIN
  status: number;               // 0=INACTIVE, 1=ACTIVE, 2=SUSPENDED, 3=REVOKED
  createdAt: number;            // Timestamp
  lastLoginAt: number;          // Timestamp
  approvalCount: number;        // Number of approvals given
}
```

**Frontend Usage:**

```javascript
// Verify account is active before allowing operations
const account = await accountManager.getAccount(userWallet);

if (account.status !== 1) {
  throw new Error(`Account is ${statusNames[account.status]}`);
}
```

---

### EHRManager.sol

**Purpose:** Manage electronic health records and lab orders on-chain

**Key Functions:**

```solidity
// Create lab order (Doctor only)
function createLabOrder(
  address patientAddress,
  string memory recordType,    // "BLOOD_TEST", "X_RAY", etc.
  string[] memory testsRequested,  // Test codes
  uint8 priority              // 1=normal, 2=urgent, 3=emergency
) external onlyDoctor(msg.sender) returns (bytes32 orderId)

// Patient consents to order
function patientConsentOrder(
  bytes32 orderId
) external onlyPatient(msg.sender)

// Get order details
function getOrder(
  bytes32 orderId
) external view returns (LabOrder)

// Lab tech can claim order
function claimOrder(
  bytes32 orderId
) external onlyLabTech(msg.sender)

// Post test results
function postTestResults(
  bytes32 orderId,
  string memory resultHash     // IPFS hash of results
) external onlyLabTech(msg.sender)

// Doctor completes workflow
function completeOrder(
  bytes32 orderId
) external onlyDoctor(msg.sender)
```

**Order Status Enum:**

```javascript
enum OrderStatus {
  PENDING_PATIENT_CONSENT,   // 0 - Waiting for patient approval
  READY_FOR_LAB,              // 1 - Patient approved, ready for lab
  PROCESSING_TESTS,           // 2 - Lab tech is running tests
  RESULTS_POSTED,             // 3 - Results available
  DOCTOR_REVIEWING,           // 4 - Doctor reviewing results
  COMPLETE,                   // 5 - Workflow finished
  CANCELLED                   // 6 - Order cancelled
}
```

**Frontend Listening to Events:**

```javascript
// Listen for new lab orders
ehrManager.on('LabOrderCreated', (doctor, patient, orderId) => {
  console.log(`New order from ${doctor} for patient ${patient}`);
  // Refresh UI
});

// Listen for status changes
ehrManager.on('OrderStatusChanged', (orderId, newStatus) => {
  console.log(`Order ${orderId} status changed to ${newStatus}`);
  // Update dashboard
});

// Listen for results posted
ehrManager.on('ResultsPosted', (orderId, resultHash) => {
  console.log(`Results posted for order ${orderId}: ${resultHash}`);
  // Fetch results from IPFS
});
```

---

## 💾 ABI Files

All contract ABIs are available in `src/blockchain/abis/`:

```
abis/
  ├── AccessControl.json       (224 lines)
  ├── AccountManager.json      (198 lines)
  └── EHRManager.json          (312 lines)
```

**Loading ABI in Frontend:**

```javascript
// Method 1: Import as JSON
import AccessControlABI from '@/blockchain/abis/AccessControl.json';

// Method 2: Fetch from backend
async function getABIs() {
  const response = await fetch(`${API_URL}/blockchain/abis`);
  return response.json();
}

// Method 3: Hardcode (for contract interaction)
const abi = [
  {
    "type": "function",
    "name": "grantAccess",
    "inputs": [
      { "name": "accessor", "type": "address" },
      { "name": "level", "type": "uint8" },
      { "name": "durationHours", "type": "uint64" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable"
  }
];
```

---

## ⛽ Gas Estimation

### Typical Gas Costs (Sepolia)

These are estimates on Sepolia testnet (use mainnet values × 0.1 for rough calculation):

| Operation | Gas | Cost (ETH) | Cost (USD) |
|-----------|-----|-----------|-----------|
| `grantAccess()` | ~85,000 | 0.0017 | $0.05 |
| `revokeAccess()` | ~45,000 | 0.0009 | $0.03 |
| `hasAccess()` | 0 (read) | 0 | $0 |
| `createAccount()` | ~120,000 | 0.0024 | $0.07 |
| `createLabOrder()` | ~180,000 | 0.0036 | $0.11 |
| `patientConsent()` | ~95,000 | 0.0019 | $0.06 |
| `claimOrder()` | ~85,000 | 0.0017 | $0.05 |
| `postResults()` | ~120,000 | 0.0024 | $0.07 |
| `completeOrder()` | ~110,000 | 0.0022 | $0.07 |

**Current Sepolia Gas Prices:**

```
Base Fee: ~2-5 Gwei
Priority Fee: ~1-2 Gwei
Total: ~3-7 Gwei per gas unit
```

**Estimate Gas Before Transaction:**

```javascript
// Get gas estimate from provider
const gasEstimate = await contract.grantAccess.estimateGas(
  doctorAddress,
  FULL,
  duration
);

console.log('Estimated gas:', gasEstimate.toString());

// Add 20% buffer
const gasLimit = gasEstimate.mul(120).div(100);

// Execute with gas limit
const tx = await contract.grantAccess(
  doctorAddress,
  FULL,
  duration,
  { gasLimit }
);
```

---

## 🔐 Transaction Signing Patterns

### Pattern 1: Simple Function Call (No Signature)

Requires:Only that user has token + authorization

```javascript
// Doctor creates lab order (backend calls contract)
curl -X POST /v1/lab-orders \
  -H "Authorization: Bearer DOCTOR_TOKEN"
```

Backend automatically signs with admin wallet.

### Pattern 2: Patient Must Sign (Wallet Signature Required)

Requires: Patient to sign transaction in MetaMask

**Current Issue:** Backend tries to call with admin wallet but contract requires patient signature.

**Solution A: Frontend Signing**

```javascript
// Frontend signs with patient's private key
const signer = Web3Service.getSigner();
const tx = await contract.grantAccess(...);
```

**Solution B: Backend Signing Workaround (if patient key available)**

```javascript
// Backend does: grantAccessOnBehalf()
// But contract doesn't support this yet
// Requires contract redeploy
```

---

## 📊 Real Transaction Examples

### Example 1: Grant Access Transaction

**From:** Patient wallet  
**To:** AccessControl contract  
**Function:** `grantAccess(doctor, 2, 168)`

```javascript
{
  to: "0x5dBf1bCa9a1e1846d3d8F0ffF8f7a6D80FCC0EFd",  // AccessControl
  from: "0xPatientWallet...",
  data: "0x07a92fe5" +  // Function selector
        "000000000000000000000000DoctorWallet" +
        "0000000000000000000000000000000000000002" +  // FULL level
        "00000000000000000000000000000000000000a8",  // 168 hours
  gasLimit: "100000",
  gasPrice: "5000000000"  // 5 Gwei
}
```

**Etherscan View:**

```
Function: grantAccess(address _accessor, uint8 _level, uint64 _durationHours)

MethodID: 0x07a92fe5
[0]:  0x0000000000000000000000000000000000000000... (doctor address)
[1]:  0x0000000000000000000000000000000000000002 (access level = FULL)
[2]:  0x00000000000000000000000000000000000000a8 (duration = 168 hours)
```

### Example 2: Create Lab Order Transaction

**From:** Doctor wallet  
**To:** EHRManager contract

```javascript
{
  to: "0x7f2F5f8...",  // EHRManager
  from: "0xDoctorWallet...",
  data: "0xabcdef12" +  // Function selector
        "000000000000000000000000PatientWallet" +
        // ... more encoded data
  gasLimit: "200000",
  gasPrice: "5000000000"
}
```

---

## 🧪 Contract Interaction Test Checklist

- [ ] Can read account status without signature (view function)
- [ ] Patient can grant access to doctor (requires wallet signature)
- [ ] Doctor cannot grant access on behalf of patient (reverted)
- [ ] Access check works correctly (hasAccess returns true/false)
- [ ] Can revoke access (requires wallet signature)
- [ ] Doctor can create lab order (requires authorization)
- [ ] Patient can consent to order (requires wallet signature)
- [ ] Lab tech can claim order (requires authorization)
- [ ] Lab tech can post results (requires authorization)
- [ ] Doctor can complete order (requires authorization)
- [ ] Events are emitted for all state changes
- [ ] Gas estimation works correctly
- [ ] Nonce validation works

---

## 🔍 Debugging Contract Calls

### Enable Debug Logging

```javascript
// src/utils/contractDebug.ts
export function setupContractDebugger(contract: ethers.Contract) {
  // Log all function calls
  const handler = {
    get: (target, prop) => {
      if (typeof target[prop] === 'function') {
        return async (...args) => {
          console.log(`📞 Calling ${String(prop)}(${args.join(', ')})`);
          try {
            const result = await target[prop](...args);
            console.log(`✅ Result:`, result);
            return result;
          } catch (error) {
            console.error(`❌ Error in ${String(prop)}:`, error);
            throw error;
          }
        };
      }
      return target[prop];
    }
  };

  return new Proxy(contract, handler);
}

// Usage
const debugContract = setupContractDebugger(contract);
await debugContract.grantAccess(doctor, 2, 168);
// Logs: 📞 Calling grantAccess(0x..., 2, 168)
//       ✅ Result: { transactionHash: '0x...' }
```

### Decode Reverted Transaction

```javascript
// When transaction reverts, decode error message
import { AbiCoder } from 'ethers';

async function decodeRevert(error: any) {
  const reason = error?.data?.slice(0, 10); // Get function selector
  const abi = new AbiCoder();

  // Map common selectors
  const errorSelectors = {
    '0x82511378': 'NotAPatient()',
    '0xb22f0f3f': 'AlreadyHasAccess()',
    '0xc1ab6dc1': 'NoAccess()',
  };

  console.log(`Error: ${errorSelectors[reason] || 'Unknown'}`);
}

try {
  await contract.grantAccess(...);
} catch (error) {
  decodeRevert(error);
}
```

---

## 📚 Resources

**Contract Files:**

- [AccessControl.sol](../contracts/AccessControl.sol)
- [AccountManager.sol](../contracts/AccountManager.sol)
- [EHRManager.sol](../contracts/EHRManager.sol)

**Etherscan Sepolia:**

- <https://sepolia.etherscan.io>

**ethers.js Documentation:**

- <https://docs.ethers.org/v6/>

**Web3 Best Practices:**

- <https://ethereum.org/en/developers/docs/smart-contracts/best-practices/>

---

## ✅ Frontend Integration Checklist

Before pushing to production:

- [ ] All contract addresses loaded from environment variables
- [ ] ABIs properly imported and validated
- [ ] Error handling for all contract calls
- [ ] Gas estimation implemented
- [ ] Transaction receipts verified
- [ ] Events listened to and handled
- [ ] Contract function access controlled by roles
- [ ] Nonce validation working
- [ ] Signature verification working
- [ ] Transaction retry logic implemented
- [ ] Testnet addresses different from mainnet
- [ ] No hardcoded addresses in code

---

**Last Updated:** April 7, 2026  
**Next Step:** Integrate these patterns into frontend React components and test end-to-end workflow.
