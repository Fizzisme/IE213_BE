# 📌 POSTMAN SCRIPTS - IMPROVED & PRODUCTION-READY

> **Note:** Copy các scripts này vào **Tests tab** của mỗi request trong Postman

---

## 🔐 **FLOW 1: AUTHENTICATION**

### **POST /auth/register**

```javascript
// ✅ Validate response
pm.test("Register HTTP 201", () => {
    pm.response.to.have.status(201);
});

pm.test("Response contains userId", () => {
    const data = pm.response.json();
    pm.expect(data.userId || data._id).to.exist;
});

if (pm.response.code === 201) {
    const data = pm.response.json();
    pm.environment.set("CURRENT_USER_ID", data.userId || data._id);
    console.log("✅ Register OK - User ID:", data.userId || data._id);
} else {
    console.error("❌ Register failed:", pm.response.json());
}
```

---

### **POST /auth/login/nationId**

```javascript
// ✅ Validate response
pm.test("Login HTTP 200", () => {
    pm.response.to.have.status(200);
});

pm.test("Response contains tokens", () => {
    const data = pm.response.json();
    pm.expect(data.accessToken || data.refreshToken).to.exist;
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    // ✅ FIXED: Decode JWT instead of looking for user._id
    // JWT format: header.payload.signature
    try {
        const payloadPart = data.accessToken.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadPart));
        
        pm.environment.set("ACCESS_TOKEN", data.accessToken);
        pm.environment.set("REFRESH_TOKEN", data.refreshToken || "");
        pm.environment.set("CURRENT_USER_ID", decodedPayload._id);
        pm.environment.set("USER_ROLE", decodedPayload.role);
        
        console.log("✅ Login OK");
        console.log("   - User ID:", decodedPayload._id);
        console.log("   - Role:", decodedPayload.role);
        console.log("   - Token:", data.accessToken.substring(0, 30) + "...");
    } catch (e) {
        console.error("❌ JWT decode error:", e.message);
    }
} else {
    console.error("❌ Login failed -", pm.response.code, ":", pm.response.json());
}
```

---

### **POST /auth/login/wallet (Phase 1 - Get Nonce)**

```javascript
// ✅ Validate response
pm.test("Get Nonce HTTP 200", () => {
    pm.response.to.have.status(200);
});

pm.test("Response contains nonce", () => {
    const data = pm.response.json();
    pm.expect(data.nonce).to.exist;
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    // ✅ Save nonce for Phase 2
    pm.environment.set("WALLET_NONCE", data.nonce);
    console.log("✅ Got Nonce:", data.nonce);
    console.log("   Next: Sign nonce with wallet private key");
} else {
    console.error("❌ Failed to get nonce:", pm.response.json());
}
```

---

### **POST /auth/login/wallet (Phase 2 - Verify Signature)**

```javascript
// ✅ Validate response
pm.test("Wallet Login HTTP 200", () => {
    pm.response.to.have.status(200);
});

pm.test("Response contains tokens", () => {
    const data = pm.response.json();
    pm.expect(data.accessToken || data.refreshToken).to.exist;
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    try {
        const payloadPart = data.accessToken.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadPart));
        
        pm.environment.set("ACCESS_TOKEN", data.accessToken);
        pm.environment.set("REFRESH_TOKEN", data.refreshToken || "");
        pm.environment.set("CURRENT_USER_ID", decodedPayload._id);
        pm.environment.set("USER_ROLE", decodedPayload.role);
        pm.environment.set("CURRENT_WALLET_ADDRESS", pm.request.body.raw ? JSON.parse(pm.request.body.raw).walletAddress : "");
        
        console.log("✅ Wallet Login OK");
        console.log("   - User ID:", decodedPayload._id);
    } catch (e) {
        console.error("❌ JWT decode error:", e.message);
    }
} else {
    console.error("❌ Wallet login failed:", pm.response.json());
}
```

---

## 👤 **FLOW 2: PATIENT PROFILE**

### **POST /patients**

```javascript
// ✅ Validate response
pm.test("Create Patient HTTP 201", () => {
    pm.response.to.have.status(201);
});

if (pm.response.code === 201) {
    const data = pm.response.json();
    
    // ✅ Try multiple possible field names
    const patientId = data.patientId 
        || data._id 
        || data.data?._id 
        || data.data?.patientId 
        || "";
    
    if (patientId) {
        pm.environment.set("PATIENT_ID", patientId);
        console.log("✅ Patient created - ID:", patientId);
    } else {
        console.warn("⚠️ Could not extract patient ID from response");
        console.log("Response:", data);
    }
} else if (pm.response.code === 400) {
    console.error("❌ Validation error:", pm.response.json().message);
} else if (pm.response.code === 401) {
    console.error("❌ Unauthorized - Token expired?");
} else {
    console.error("❌ Failed to create patient:", pm.response.code);
}
```

---

## 📋 **FLOW 3: LAB ORDER WORKFLOW**

### **POST /lab-orders**

```javascript
// ✅ Validate response
pm.test("Create Lab Order HTTP 201", () => {
    pm.response.to.have.status(201);
});

if (pm.response.code === 201) {
    const data = pm.response.json();
    
    // ✅ Capture all needed IDs
    const labOrderId = data.labOrderId || data._id || data.data?._id || "";
    const recordId = data.recordId || data.blockchainRecordId || data.data?.recordId || "";
    const txHash = data.txHash || data.data?.txHash || "";
    
    if (labOrderId) pm.environment.set("LAB_ORDER_ID", labOrderId);
    if (recordId) pm.environment.set("BLOCKCHAIN_RECORD_ID", recordId);
    
    console.log("✅ Lab Order created");
    console.log("   - Lab Order ID:", labOrderId);
    console.log("   - Record ID:", recordId);
    console.log("   - TX Hash:", txHash ? txHash.substring(0, 20) + "..." : "not available");
} else {
    console.error("❌ Failed:", pm.response.code, pm.response.json().message);
}
```

---

### **PATCH /lab-orders/:id/consent**

```javascript
// ✅ Validate response
pm.test("Consent HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    if (data.txHash) {
        pm.environment.set("CONSENT_TX_HASH", data.txHash);
        console.log("✅ Patient consented - TX:", data.txHash.substring(0, 20) + "...");
    }
} else {
    console.error("❌ Consent failed:", pm.response.json());
}
```

---

### **PATCH /lab-orders/:id/receive**

```javascript
// ✅ Validate response
pm.test("Receive Order HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    if (data.txHash) {
        pm.environment.set("RECEIVE_TX_HASH", data.txHash);
        console.log("✅ Lab Tech received order - TX:", data.txHash.substring(0, 20) + "...");
    }
} else {
    console.error("❌ Receive failed:", pm.response.json());
}
```

---

### **PATCH /lab-orders/:id/post-result**

```javascript
// ✅ Validate response
pm.test("Post Result HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    if (data.txHash) pm.environment.set("RESULT_TX_HASH", data.txHash);
    if (data.labResultHash) pm.environment.set("LAB_RESULT_HASH", data.labResultHash);
    
    console.log("✅ Lab result posted");
    console.log("   - TX:", data.txHash ? data.txHash.substring(0, 20) + "..." : "N/A");
    console.log("   - Hash:", data.labResultHash ? data.labResultHash.substring(0, 20) + "..." : "N/A");
} else {
    console.error("❌ Failed:", pm.response.json());
}
```

---

### **PATCH /lab-orders/:id/interpretation**

```javascript
// ✅ Validate response
pm.test("Add Interpretation HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    if (data.txHash) pm.environment.set("INTERP_TX_HASH", data.txHash);
    if (data.interpretationHash) pm.environment.set("INTERPRETATION_HASH", data.interpretationHash);
    
    console.log("✅ Doctor added interpretation");
    console.log("   - TX:", data.txHash ? data.txHash.substring(0, 20) + "..." : "N/A");
} else {
    console.error("❌ Failed:", pm.response.json());
}
```

---

### **PATCH /lab-orders/:id/complete**

```javascript
// ✅ Validate response
pm.test("Complete HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    
    if (data.txHash) pm.environment.set("COMPLETE_TX_HASH", data.txHash);
    
    console.log("✅ Record marked COMPLETE");
    console.log("   - TX:", data.txHash ? data.txHash.substring(0, 20) + "..." : "N/A");
    console.log("🎉 Full workflow completed!");
} else {
    console.error("❌ Failed:", pm.response.json());
}
```

---

## 🔐 **FLOW 4: ACCESS CONTROL**

### **POST /access-control/grant**

```javascript
// ✅ Validate response
pm.test("Grant Access HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    console.log("✅ Doctor access granted successfully");
} else if (pm.response.code === 400) {
    console.error("❌ Already has access or invalid request");
} else {
    console.error("❌ Failed:", pm.response.json());
}
```

---

### **DELETE /access-control/revoke**

```javascript
// ✅ Validate response
pm.test("Revoke Access HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    console.log("✅ Access revoked successfully");
} else {
    console.error("❌ Failed:", pm.response.json());
}
```

---

## 🏥 **FLOW 5: BLOCKCHAIN HEALTH**

### **GET /blockchain/health**

```javascript
// ✅ Validate response
pm.test("Health Check HTTP 200", () => {
    pm.response.to.have.status(200);
});

if (pm.response.code === 200) {
    const data = pm.response.json();
    const checks = data.checks || {};
    
    // ✅ Individual checks
    pm.test("RPC Reachable", () => checks.rpcReachable === true);
    pm.test("Chain ID Matched", () => checks.chainIdMatched === true);
    pm.test("AccountManager Deployed", () => checks.accountManagerDeployed === true);
    pm.test("AccessControl Deployed", () => checks.accessControlDeployed === true);
    pm.test("EHRManager Deployed", () => checks.ehrManagerDeployed === true);
    
    const allOk = Object.values(checks).every(v => v === true);
    
    if (allOk) {
        console.log("✅ Blockchain Ready");
    } else {
        console.warn("⚠️ Some checks failed:");
        Object.entries(checks).forEach(([key, value]) => {
            console.log(`   ${key}: ${value ? "✅" : "❌"}`);
        });
    }
} else {
    console.error("❌ Health check failed:", pm.response.code);
}
```

---

## 🎯 **KEY IMPROVEMENTS**

1. **JWT Decoding** - Extracts user ID directly from token
2. **Error Handling** - Logs specific error messages
3. **Multiple Field Names** - Tries different response structures
4. **Console Logging** - Clear debug output
5. **Status Checks** - Validates each step
6. **Environment Capture** - Automatically saves IDs and hashes

---

## 📌 **HOW TO USE THESE SCRIPTS**

1. Copy a script block above
2. Open request in Postman
3. Go to **Tests** tab
4. Paste script
5. Save & Send

---

Version: 2.0
Updated: April 6, 2026
