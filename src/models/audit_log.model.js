import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  action: { type: String,
    enum: [
      'LOGIN_LOCAL',
      'LOGIN_WEB3',
      'LOGIN_OAUTH',
      'VIEW',
      'SUBMIT'
    ],
    required: true,
    index: true
  },
  details: {
    ip: { type: String },
    device: { type: String },
    record_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalRecord'
    }
  }

}, { timestamps: { createdAt: 'created_at', updatedAt: false } })


// Index tối ưu cho truy vấn theo user + thời gian
auditLogSchema.index({ user_id: 1, created_at: -1 })

const AuditLogModel = mongoose.model('AuditLog', auditLogSchema)
export default AuditLogModel
