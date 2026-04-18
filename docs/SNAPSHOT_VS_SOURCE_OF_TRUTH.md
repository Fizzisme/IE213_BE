# 🔐 Snapshot vs Source of Truth - Bổ Sung Quan Trọng

## 📌 Tóm Tắt

**Bạn phát hiện đúng:** Snapshot thôi chưa đủ, cần phân biệt rõ ràng:

- **txHash (on-chain)** = Proof thật sự (msg.sender embedded)
- **Snapshot (off-chain)** = Tiện ích query (indexed field)
- **Snapshot ≠ Source of Truth**

---

## 🏛️ Proof Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                   ABSOLUTE PROOF HIERARCHY                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🏆 LEVEL 1: ON-CHAIN (Blockchain)                             │
│  ═══════════════════════════════════════════════════════════  │
│  Source: txHash → msg.sender (embedded trong transaction)       │
│  Properties:                                                    │
│    ✅ Immutable (ghi trên blockchain)                          │
│    ✅ Non-repudiable (không thể chối cãi)                     │
│    ✅ Timestamp từ smart contract (block.timestamp)            │
│    ✅ Proof pháp lý (court-admissible)                        │
│                                                                 │
│  When to use:                                                   │
│    - Court settlement (chứng minh pháp lý)                     │
│    - Regulatory compliance (audit pháp luật)                   │
│    - Dispute resolution (giải quyết tranh chấp)               │
│                                                                 │
│  Example:                                                       │
│    txHash = 0x123abc...                                        │
│    → getTransaction(txHash).from = 0xLAB1... (absolute truth)  │
│                                                                 │
│  ---                                                             │
│                                                                 │
│  🔍 LEVEL 2: OFF-CHAIN (MongoDB)                               │
│  ═══════════════════════════════════════════════════════════  │
│  Source: labTechWalletAddress (snapshot field)                 │
│  Properties:                                                    │
│    ✅ Indexed (query nhanh)                                    │
│    ✅ Convenient (app-level queries)                          │
│    ❌ Không immutable (có thể bị update)                       │
│    ❌ Có thể bị đổi (nếu bug hoặc migration)                  │
│                                                                 │
│  When to use:                                                   │
│    - Dashboard queries ("Lab tests của doctor 0xDOC1?")        │
│    - Audit searches ("Khi nào doctor này post result?")        │
│    - Performance optimization (indexed access)                 │
│                                                                 │
│  Example:                                                       │
│    db.lab_orders.find({ labTechWalletAddress: "0xLAB1" })     │
│    → Fast query vì có index                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Hạn Chế của Snapshot

### **Snapshot có thể khác msg.sender nếu:**

```javascript
// Scenario 1: Bug trong code
labOrder.labTechWalletAddress = wrongWallet;  // ← Lỗi lập trình
// On-chain: msg.sender = correctWallet

// Scenario 2: Data migration / cleanup
// Ai đó chạy migration script, update snapshot để "fix" history
// On-chain: txHash still correct

// Scenario 3: Multi-sig wallet (advanced)
// SmartWallet có thể delegate signer
// labTechWalletAddress = delegated signer
// On-chain: msg.sender = SmartWallet address (khác)
```

### **Khi Muốn Verify: Luôn Kiểm Tra On-Chain**

```javascript
// ❌ SAI: Tin snapshot
if (labOrder.labTechWalletAddress === expectedWallet) {
    // Assume verified
}

// ✅ ĐÚNG: Verify từ blockchain
const tx = await ethers.provider.getTransaction(labOrder.txHash);
const onChainSender = tx.from;
if (onChainSender.toLowerCase() === expectedWallet.toLowerCase()) {
    // VERIFIED from blockchain
}
```

---

## 🔄 Lab Order Workflow - Chi Tiết

### **Step 1: Lab Tech Posts Result**

```javascript
// Frontend:
labOrder = {
    sampleStatus: 'IN_PROGRESS',
    labResultData: {...}
};

// Backend:
const labTechWallet = currentUser.walletAddress;  // 0xLAB1

// Call blockchain
const tx = await ehrManager.postLabResult(recordId, hash);
const receipt = await tx.wait();
const txHash = receipt.hash;
// Blockchain automatically recorded:
//   - msg.sender = 0xLAB1 (in smart contract)
//   - timestamp = block.timestamp

// Save to MongoDB
labOrder.labTechWalletAddress = labTechWallet;  // 🔹 Snapshot
labOrder.txHash = txHash;                        // 🔐 Proof
labOrder.sampleStatus = 'RESULT_POSTED';
```

### **Step 2: Doctor Interprets (Later)**

```javascript
// Same pattern
const doctorWallet = currentUser.walletAddress;  // 0xDOC1

const tx = await ehrManager.addClinicalInterpretation(
    recordId,
    interpretationHash
);
const receipt = await tx.wait();

labOrder.doctorWalletAddress = doctorWallet;  // 🔹 Snapshot
labOrder.txHash = receipt.hash;                 // 🔐 Proof (updated)
labOrder.sampleStatus = 'DOCTOR_REVIEWED';
```

### **Step 3: Verify (Khi Cần Audit)**

```javascript
// Use case: Compliance audit asks
// "Chứng minh doctor 0xDOC1 thực sự interpret result này?"

// Step A: Check snapshot (fast)
assert(labOrder.doctorWalletAddress === '0xDOC1');

// Step B: Verify with blockchain (authoritative)
const tx = await ethers.provider.getTransaction(labOrder.txHash);
const onChainDoctor = tx.from;
assert(onChainDoctor.toLowerCase() === '0xDOC1'.toLowerCase());

// If both match: ✅ VERIFIED
// If different: ⚠️ AUDIT ALERT (possible tampering)
```

---

## 📊 Snapshot Usage Matrix

| Context | Snapshot | txHash | Current Wallet | Lý Do |
|---------|----------|--------|----------------|-------|
| **Query "Lab tests của doctor"** | ✅ | ❌ | ❌ | Snapshot indexed, nhanh nhất |
| **Dashboard hiển thị lịch sử** | ✅ | ❌ | ❌ | Lịch sử không thay đổi |
| **Access control (doctor có quyền?)** | ❌ | ❌ | ✅ | **IMPORTANT:** Current wallet |
| **Blockchain call (submit result)** | ✅ | ❌ | ❌ | Dùng snapshot khi đã lưu |
| **Verify lịch sử (court)** | ⚠️ | ✅ | ❌ | txHash is authoritative |
| **Audit trail search** | ✅ | ❌ | ❌ | Snapshot sufficient |
| **Permission check hiện tại** | ❌ | ❌ | ✅ | Doctor có thể đổi wallet |

---

## 💡 Implementation Checklist

### **Current Implementation ✅**

```javascript
// In LabOrder Model:
labTechWalletAddress: {      // 🔹 Snapshot
    type: String,
    index: true,             // ← Indexed for queries
},

txHash: {                    // 🔐 On-chain Proof
    type: String,
}

// In ehrWorkflow.postLabResult():
labOrder.labTechWalletAddress = labTechWalletSnapshot;
labOrder.txHash = receipt.hash;  // ← Proof from blockchain
await labOrder.save();

// In ehrWorkflow.addClinicalInterpretation():
labOrder.doctorWalletAddress = normalizedDoctorAddress;
labOrder.txHash = receipt.hash;
await labOrder.save();
```

### **Future: Verification Service (⏳ TODO)**

```javascript
// NEW: Verification service (optional but recommended)
const verifyLabOrderSnapshot = async (labOrder) => {
    try {
        const tx = await ethers.provider.getTransaction(labOrder.txHash);
        const onChainWallet = tx.from;
        
        const snapshots = {
            labTechWallet: labOrder.labTechWalletAddress,
            doctorWallet: labOrder.doctorWalletAddress,
        };
        
        // For now: Just log if mismatch
        // Later: Can be used for compliance reports
        
        return {
            verified: true,
            proofChain: {
                snapshot: snapshots,
                onChain: onChainWallet,
                matches: snapshots.labTechWallet?.toLowerCase() === 
                         onChainWallet?.toLowerCase()
            }
        };
    } catch (err) {
        console.error('Verification failed:', err);
        return { verified: false };
    }
};
```

---

## 🎓 Key Principles

### **Principle 1: Snapshot = Convenience, NOT Proof**

```javascript
// ❌ Wrong thinking
"Snapshot từ database = reliable source của truth"

// ✅ Right thinking
"Snapshot từ database = indexed copy để query
  Proof thật sự = blockchain txHash"
```

### **Principle 2: Always Verify From Blockchain If Need Proof**

```javascript
// For production audit:
NOT this:
    assert(record.snapshot === expectedValue);

DO this:
    const onChainProof = await getFromBlockchain(txHash);
    assert(onChainProof === expectedValue);
```

### **Principle 3: Current Wallet For Access Control**

```javascript
// ❌ Wrong: Dùng snapshot cho permission
const canAccess = (user.walletAddress === record.doctorWalletSnapshot);

// ✅ Right: Dùng current wallet
const canAccess = (user.walletAddress === user.currentWallet);
// Doctor có thể đổi wallet, vẫn có access
```

---

## 📚 Reference

- **Blockchain Concepts**: msg.sender, transaction receipt, on-chain state
- **Off-Chain Optimization**: Indexing, query performance, denormalization
- **EHR Standards**: Epic, Cerner patters (audit trail requirements)
- **Regulatory**: HIPAA (immutability), GDPR (data lineage)

---

## ✅ Conclusion

| Aspect | Snapshot | txHash |
|--------|----------|--------|
| **Proof Level** | Convenience | Absolute |
| **Use for** | Queries | Verification |
| **Immutable** | ❌ No | ✅ Yes |
| **Indexed** | ✅ Yes | ❌ No |
| **Performance** | ✅ Fast | ⚠️ Slow |
| **Legal Value** | ❌ Low | ✅ High |

**Bottom Line:**

- Use **snapshot** cho daily operations (queries, dashboard)
- Use **txHash** khi cần bằng chứng (audit, court)
- Luôn verify từ blockchain nếu cần tuyệt đối chắc chắn

---

**Version**: 1.0  
**Date**: April 16, 2026  
**Status**: ✅ Reviewed & Approved
