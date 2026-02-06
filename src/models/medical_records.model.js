import mongoose from 'mongoose'

const medicalRecordSchema = new mongoose.Schema({

  // Quan hệ
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  doctor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Dữ liệu y tế (Mã hóa AES hoàn toàn)
  encrypted_data: {
    result: { // AES encrypted result
      data: { type: String, required: true },
      iv: { type: String, required: true }
    },
    cd4: { // AES encrypted lab value
      data: { type: String },
      iv: { type: String }
    },
    notes: {
      data: { type: String },
      iv: { type: String }
    }
  },

  // AI Validation Layer
  ai_validation: {
    is_tampered: { type: Boolean, default: false },
    confidence: { type: Number, min: 0, max: 1 },
    raw_ocr_hash: { type: String } // KHÔNG lưu raw OCR để tránh lộ data
  },

  // Blockchain Proof
  blockchain_proof: {
    tx_hash: { type: String },
    block_number: { type: Number },
    data_hash_on_chain: { type: String }, // SHA256(encrypted_data)
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'FAILED'],
      default: 'PENDING'
    }
  }

}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: false // IMMUTABLE
  }
})

// Chặn update sau khi tạo
medicalRecordSchema.pre('findOneAndUpdate', function () {
  throw new Error('Medical records are immutable and cannot be updated.')
})
medicalRecordSchema.pre('updateOne', function () {
  throw new Error('Medical records are immutable and cannot be updated.')
})
medicalRecordSchema.pre('deleteOne', function () {
  throw new Error('Medical records cannot be deleted.')
})

// index tối ưu truy vấn
medicalRecordSchema.index({ patient_id: 1, created_at: -1 })
medicalRecordSchema.index({ doctor_id: 1 })
medicalRecordSchema.index({ 'blockchain_proof.tx_hash': 1 })

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema)
export default MedicalRecord
