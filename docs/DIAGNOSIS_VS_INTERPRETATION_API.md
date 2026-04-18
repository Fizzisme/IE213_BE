# 🏥 API Diagnosis vs Interpretation - Chi Tiết Đầy Đủ

**Câu hỏi:** Vụ API diagnosis với interpretation khác nhau như nào?  
**Đáp:** Khác nhau cách xương!

---

## 📊 Quick Comparison

| Aspect | Diagnosis | Interpretation |
|--------|-----------|-----------------|
| **Khi nào dùng** | Lúc tạo order (trước xét nghiệm) | Sau khi lab post results |
| **Ai đó** | Bác sĩ khám bệnh | Bác sĩ chỉ định |
| **Nội dung** | Nghi ngờ gì (E11.9 = tiểu đường) | Kết quả xét nghiệm có nghĩa gì |
| **Có thể đổi không** | ✅ Yes, có thể update | ❌ No, bất biến (blockchain) |
| **On blockchain** | ❌ No, chỉ trong MongoDB | ✅ Yes, hash bất biến |
| **Endpoint** | PATCH /v1/doctors/medical-records/:recordId/diagnosis | POST /v1/medical-records/:recordId/interpretation |
| **Http method** | PATCH (update) | POST (create) |

---

## � States/Trạng Thái Trong Flow

| State | Mô Tả | Diagnosis | Interpretation |
|-------|-------|-----------|-----------------|
| **ORDERED** | Doctor tạo order, chưa patient consent | ✅ Can update | ❌ Not yet |
| **CONSENTED** | Patient đã approved | ✅ Can update | ❌ Not yet |
| **IN_PROGRESS** | Lab tech đang làm test | ✅ Can update | ❌ Not yet |
| **RESULT_POSTED** | Lab tech post results xong | ✅ Can update | ❌ Can now add |
| **DOCTOR_REVIEWED** | Doctor post interpretation (FINAL) | ✅ Can update | ✅ Posted (immutable!) |

**State Transitions:**

```
ORDERED → CONSENTED → IN_PROGRESS → RESULT_POSTED → DOCTOR_REVIEWED
```

---

## �📋 DIAGNOSIS API (Có thể thay đổi)

### Diagram Luồng

```
┌─────────────────────────────────────────────────────────┐
│ SCENARIO: Doctor sees patient, nghi ngờ tiểu đường      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ STEP 1: Doctor order xét nghiệm                        │
│   → POST /v1/lab-orders                                │
│   → diagnosisCode: "E11.9" (Type 2 Diabetes)           │
│   → diagnosis: "Nghi ngờ tiểu đường type 2"            │
│                                                         │
│        ↓ (Chưa chắc, chỉ là nghi ngờ)                 │
│                                                         │
│ STEP 2: Kết quả xét nghiệm trở về (glucose 285)       │
│   → Xác nhận là tiểu đường thật!                       │
│   → Doctor muốn UPDATE diagnosis để chắc hơn           │
│                                                         │
│        ↓                                                │
│                                                         │
│ STEP 3: Doctor call PATCH diagnosis                    │
│   → PATCH /v1/doctors/medical-records/507f.../diagnosis
│   → diagnosis: "Type 2 Diabetes confirmed"             │
│   → Lưu vào MongoDB (không on-chain)                   │
│   → Có thể edit lại sau nếu cần                        │
│                                                         │
│        ↓                                                │
│                                                         │
│ STEP 4: Doctor post Interpretation (Bất biến)         │
│   → POST /v1/medical-records/.../interpretation        │
│   → interpretation: "Glucose 285 cao, A1C 9.2..."      │
│   → Lưu trên blockchain (bất biến)                     │
│   → Không có thể edit nữa!                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### API: GET Diagnosis

```http
GET /v1/doctors/medical-records/507f1f77bcf86cd799439999/diagnosis HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**

```json
{
  "recordId": "507f1f77bcf86cd799439999",
  "diagnosis": "Nghi ngờ tiểu đường type 2",
  "diagnosisCode": "E11.9",
  "confirmedDiagnosis": null,  // Chưa confirm
  "diagnoses": [
    {
      "text": "Nghi ngờ tiểu đường type 2",
      "code": "E11.9",
      "status": "initial",
      "createdAt": "2026-04-09T10:00:00Z",
      "createdBy": "Dr. Minh"
    }
  ]
}
```

### API: PATCH Update Diagnosis

```http
PATCH /v1/doctors/medical-records/507f1f77bcf86cd799439999/diagnosis HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "diagnosis": "Type 2 Diabetes confirmed",
  "diagnosisCode": "E11.9",
  "confirmedDiagnosis": "Type 2 Diabetes",     // ← New field
  "confidence": 95,                             // % chắc chắn
  "note": "Confirmed by latest lab results"
}
```

**Backend Service (src/services/medicalRecord.service.js):**

```javascript
const updateDiagnosis = async (recordId, doctorUser, diagnosisData) => {
  // [TIME: 14:45:00] Sau khi xét nghiệm trở về
  
  // Step 1: Verify record exists
  const record = await medicalRecordModel.findById(recordId);
  if (!record) throw new ApiError(404, 'Record not found');
  
  // Step 2: Check permission (doctor who created order)
  if (!record.doctorId.equals(doctorUser._id)) {
    throw new ApiError(403, 'Only ordering doctor can update diagnosis');
  }
  
  // Step 3: Update diagnosis in MongoDB (⚠️ NOT on blockchain)
  const updated = await medicalRecordModel.updateOne(
    { _id: recordId },
    {
      diagnosis: diagnosisData.diagnosis,
      diagnosisCode: diagnosisData.diagnosisCode,
      confirmedDiagnosis: diagnosisData.confirmedDiagnosis,
      confidence: diagnosisData.confidence,
      
      // Add to history
      $push: {
        diagnoses: {
          text: diagnosisData.diagnosis,
          code: diagnosisData.diagnosisCode,
          status: 'confirmed',
          createdAt: new Date(),
          createdBy: doctorUser.fullName,
          note: diagnosisData.note
        }
      },
      
      updatedAt: new Date()
    }
  );
  
  // Step 4: Log to audit trail
  await auditLogModel.create({
    action: 'DIAGNOSIS_UPDATED',
    recordId: recordId,
    doctor: doctorUser._id,
    changes: {
      from: record.diagnosis,
      to: diagnosisData.diagnosis,
      confirmedDiagnosis: diagnosisData.confirmedDiagnosis
    },
    timestamp: new Date()
  });
  
  // ⚠️ NO blockchain call here! Only MongoDB
  
  return updated;
};
```

**Response:**

```json
{
  "success": true,
  "message": "Diagnosis updated",
  "data": {
    "recordId": "507f1f77bcf86cd799439999",
    "diagnosis": "Type 2 Diabetes confirmed",
    "confirmedDiagnosis": "Type 2 Diabetes",
    "confidence": 95,
    "diagnoses": [
      {
        "text": "Nghi ngờ tiểu đường type 2",
        "status": "initial",
        "createdAt": "2026-04-09T10:00:00Z"
      },
      {
        "text": "Type 2 Diabetes confirmed",
        "status": "confirmed",
        "createdAt": "2026-04-09T14:45:00Z"
      }
    ]
  }
}
```

---

## 📝 INTERPRETATION API (Bất biến)

### Diagram Luồng

```
┌──────────────────────────────────────────────────────┐
│ SCENARIO: Doctor nhận kết quả xét nghiệm             │
├──────────────────────────────────────────────────────┤
│                                                       │
│ STEP 1: Xét nghiệm trở về từ lab                     │
│   → testResults: glucose=285, A1C=9.2%, CBC=OK       │
│                                                       │
│        ↓                                              │
│                                                       │
│ STEP 2: Doctor đọc kết quả                           │
│   → Phân tích: Glucose cao, A1C cao = tiểu đường     │
│   → Viết diễn giải lâm sàng (interpretation)         │
│                                                       │
│        ↓                                              │
│                                                       │
│ STEP 3: Doctor call POST interpretation              │
│   → POST /v1/medical-records/.../interpretation      │
│   → interpretation: "glucose 285 cao, A1C 9.2..."    │
│   → Compute hash → post on-chain (BẤT BIẾN)         │
│   → NO thể edit nữa!                                 │
│                                                       │
│        ↓                                              │
│                                                       │
│ RESULT:                                              │
│   ✅ interpretationHash on blockchain (forever)      │
│   ✅ Audit trail: Doctor đó, thời gian đó            │
│   ✅ Không người nào sửa lại được                    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### API: GET Interpretation

```http
GET /v1/medical-records/507f1f77bcf86cd799439999/interpretation HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**

```json
{
  "recordId": "507f1f77bcf86cd799439999",
  "interpretation": "Fasting glucose 285 mg/dL indicates severe hyperglycemia. 
      A1C 9.2% indicates poor glycemic control over past 3 months. 
      Combined with initial diagnosis, this confirms Type 2 Diabetes.",
  "interpretationHash": "0x5678efgh...",
  "interpretedAt": "2026-04-09T16:00:00Z",
  "interpretedBy": "Dr. Minh",
  "isFinal": true,
  "onBlockchain": true,
  "blockchainTx": "0xabc123def456..."
}
```

### API: POST Create Interpretation

```http
POST /v1/medical-records/507f1f77bcf86cd799439999/interpretation HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
    "interpretation": "Fasting glucose 285 mg/dL indicates severe hyperglycemia. 
        A1C 9.2% indicates poor glycemic control over past 3 months. 
        Combined with the clinical history, this confirms Type 2 Diabetes Mellitus."
}
```

**Backend Service (SAME CODE we already showed):**

```javascript
// src/services/medicalRecord.service.js
const addInterpretation = async (recordId, doctorUser, interpretationText) => {
    // [TIME: 16:00:00]
    
    // Step 1: Fetch blockchain record
    const record = await blockchainContracts.read.ehrManager
        .getRecord(recordId);
    
    if (record.status !== 'IN_PROGRESS' && record.status !== 'RESULT_POSTED') {
        throw new ApiError(400, 'Lab results must be posted first');
    }
    
    // Step 2: Save to MongoDB
    const interpretation = await medicalRecordModel.updateOne(
        { _id: recordId },
        {
            clinicalInterpretation: interpretationText,
            interpretedBy: doctorUser._id,
            interpretedAt: new Date()
        }
    );
    
    // Step 3: Compute hash
    const interpretationHash = ethers.solidityKeccak256(
        ['string'],
        [interpretationText]
    );
    
    // Step 4: Send to blockchain (ON-CHAIN, IMMUTABLE)
    await blockchainContracts.write.ehrManager.postInterpretation(
        recordId,
        interpretationHash
    );
    
    // Step 5: Update status
    await blockchainContracts.write.ehrManager.updateStatus(
        recordId,
        'DOCTOR_REVIEWED'
    );
    
    return { interpretation, hash: interpretationHash };
};
```

**Response:**

```json
{
  "success": true,
  "message": "Interpretation added and posted to blockchain",
  "data": {
    "recordId": "507f1f77bcf86cd799439999",
    "interpretation": "Fasting glucose 285 mg/dL...",
    "interpretationHash": "0x5678efgh...",
    "blockchainTx": "0xabc123def456...",
    "status": "DOCTOR_REVIEWED",
    "isFinal": true,
    "note": "This interpretation is now immutable on blockchain"
  }
}
```

---

## 🔄 Full Timeline: Diagnosis → Interpretation

```
┌─────────────────────────────────────────────────────────────┐
│                    TIMELINE                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 10:00:00  Doctor meets patient                             │
│   └─> feels tired, dry mouth                               │
│   └─> suspects diabetes                                     │
│   └─> initial diagnosis: "nghi ngờ tiểu đường"            │
│       (diagnosisCode: E11.9)                                │
│                                                              │
│ 10:05:00  Doctor orders tests                             │
│   └─> POST /v1/lab-orders                                 │
│   └─> diagnosis: "nghi ngờ tiểu đường"        ← Diagnosis  │
│   └─> ✅ Saved in MongoDB                                  │
│   └─> ✅ orderHash on blockchain              ← NOT diagnosis
│                                                              │
│ 10:15:00  Patient consents                                 │
│   └─> POST /consent/{recordId}                             │
│   └─> Status: ORDERED → CONSENTED                          │
│                                                              │
│ 14:30:00  Lab posts results                               │
│   └─> glucose: 285 mg/dL, A1C: 9.2%                       │
│   └─> ✅ Saved in MongoDB                                  │
│   └─> ✅ labResultHash on blockchain                       │
│                                                              │
│ 14:45:00  Doctor reads results                             │
│   └─> Sees glucose 285, A1C 9.2%                          │
│   └─> "Confirmed! It's really diabetes"                   │
│   └─> PATCH /diagnosis                                    │
│   └─> diagnosis: "Type 2 Diabetes confirmed"  ← Update!   │
│   └─> confirmedDiagnosis: "Type 2 Diabetes"              │
│   └─> ✅ Saved in MongoDB (can edit)                       │
│   └─> ❌ NOT on blockchain (not important yet)             │
│                                                              │
│ 16:00:00  Doctor interprets results                        │
│   └─> POST /interpretation                                 │
│   └─> "glucose 285 high, A1C 9.2% high,                   │
│        confirms Type 2 Diabetes..."          ← Interpretation
│   └─> ✅ Saved in MongoDB                                  │
│   └─> ✅ interpretationHash on blockchain                  │
│   └─> 🔒 IMMUTABLE (can't edit) BẤT BIẾN                   │
│   └─> Status: DOCTOR_REVIEWED                              │
│                                                              │
│ RESULT at end:                                              │
│   ✅ Diagnosis: editable (MongoDB only)                     │
│   ✅ Interpretation: immutable (blockchain)                 │
│   ✅ Complete audit trail                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💾 Data Storage Pattern

### Diagnosis (Mutable - MongoDB only)

```javascript
// db.medicalRecords

{
  _id: ObjectId("507f1f77bcf86cd799439999"),
  
  // ✅ Can update
  diagnosis: "Type 2 Diabetes confirmed",
  diagnosisCode: "E11.9",
  confirmedDiagnosis: "Type 2 Diabetes",
  confidence: 95,
  
  // ✅ History for audit
  diagnoses: [
    { text: "nghi ngờ tiểu đường type 2", status: "initial", createdAt: 10:00 },
    { text: "Type 2 Diabetes confirmed", status: "confirmed", createdAt: 14:45 }
  ],
  
  // ❌ NOT on blockchain
  // ❌ Can be edited anytime
  
  updatedAt: ISODate("2026-04-09T14:45:00Z")
}
```

### Interpretation (Immutable - Blockchain)

```javascript
// db.medicalRecords

{
  _id: ObjectId("507f1f77bcf86cd799439999"),
  
  // ✅ Saved to MongoDB
  clinicalInterpretation: "glucose 285 high, A1C 9.2% high...",
  interpretedBy: ObjectId("doctor_001"),
  interpretedAt: ISODate("2026-04-09T16:00:00Z"),
  
  // ✅ Hash also on blockchain
  interpretationHash: "0x5678efgh...",
  blockchainTx: "0xabc123def456...",
  
  // ❌ CANNOT edit
  // ❌ Immutable forever
  
  isFinal: true
}

// On Blockchain:
// records[recordId].interpretationHash = 0x5678efgh... ← FOREVER
// records[recordId].status = DOCTOR_REVIEWED
```

---

## 🔒 Key Difference

### Diagnosis (FLEXIBLE - Before & After Results)

```
┌──────────────────────────────────────────┐
│ Can be edited MULTIPLE TIMES             │
├──────────────────────────────────────────┤
│                                          │
│ Version 1: "Nghi ngờ tiểu đường"        │
│   └─> When ordering tests               │
│                                          │
│ Version 2: "Type 2 Diabetes confirmed"  │
│   └─> After seeing bad lab results      │
│                                          │
│ Version 3: "Type 2 Diabetes, severe"    │
│   └─> After doctor consultation         │
│                                          │
│ ✅ mongodb.update() works fine            │
│ ❌ NOT on blockchain (would be expensive) │
│                                          │
└──────────────────────────────────────────┘
```

### Interpretation (IMMUTABLE - After Results)

```
┌──────────────────────────────────────────┐
│ CANNOT be edited once posted             │
├──────────────────────────────────────────┤
│                                          │
│ Posted: "glucose 285 high, A1C 9.2%"   │
│   └─> Frozen on blockchain forever      │
│   └─> interpretationHash stored          │
│   └─> Event emitted (audit trail)        │
│                                          │
│ ✅ blockchain.postInterpretation() works │
│ ✅ Hash prevents tampering               │
│ ✅ Permanent audit trail                 │
│                                          │
└──────────────────────────────────────────┘
```

---

## 🚀 Usage Examples

### Example 1: Update Diagnosis After Seeing Lab Results

```bash
# Doctor sees results are bad, so updates diagnosis to "CONFIRMED"

curl -X PATCH http://localhost:3000/v1/doctors/medical-records/507f1f77bcf86cd799439999/diagnosis \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "diagnosis": "Type 2 Diabetes Mellitus",
    "confirmedDiagnosis": "Type 2 Diabetes",
    "confidence": 95,
    "note": "Confirmed by lab results: glucose 285, A1C 9.2%"
  }'

# Response: ✅ Updated successfully
```

### Example 2: Post Interpretation (FINAL, IMMUTABLE)

```bash
# Doctor writes analysis of what results mean

curl -X POST http://localhost:3000/v1/medical-records/507f1f77bcf86cd799439999/interpretation \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "interpretation": "Fasting glucose 285 mg/dL (normal < 100) indicates severe hyperglycemia. 
        A1C 9.2% indicates poor glycemic control over past 3 months (normal < 5.7%).
        CBC values within normal limits. Combined clinical picture confirms Type 2 Diabetes."
  }'

# Response: ✅ Posted to blockchain, now permanent and immutable
```

---

## 📚 Related Routes (In Your Backend)

```javascript
// From your codebase:

// DIAGNOSIS endpoints
PATCH /v1/doctors/medical-records/:recordId/diagnosis
GET  /v1/doctors/medical-records/:recordId/diagnosis

// INTERPRETATION endpoints
POST  /v1/medical-records/:recordId/interpretation
GET   /v1/medical-records/:recordId/interpretation

// Alternative routes (if using ehrWorkflow):
POST /v1/ehr-workflow/add-interpretation/:labOrderId
```

---

## ✅ Summary

| Question | Answer |
|----------|--------|
| **What is Diagnosis?** | Doctor's assessment of what disease patient has (can change) |
| **What is Interpretation?** | Analysis of lab results and what they mean (cannot change) |
| **Where is Diagnosis stored?** | MongoDB only (mutable) |
| **Where is Interpretation stored?** | MongoDB + Blockchain (immutable) |
| **When to use Diagnosis API?** | When you want to UPDATE diagnosis after seeing results |
| **When to use Interpretation API?** | When doctor needs to finalize analysis of results |
| **Can I edit Interpretation later?** | ❌ NO! It's on blockchain, immutable forever |
| **Can I edit Diagnosis later?** | ✅ YES! It's just in MongoDB |

---

**Tóm lại:** Diagnosis = "Mình nghĩ là...", Interpretation = "Hôm qua mình xác nhận là..." (không thể đổi!)
