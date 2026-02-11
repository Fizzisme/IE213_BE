import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
const userSchema = mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  // Đây là ví dùng để định danh trên Smart Contract (Nghiệp vụ EHR)
  // Nó có thể null nếu user Local chưa liên kết ví.
  primary_wallet: { type: String, lowercase: true, sparse: true, unique: true },
  auth_providers: [{
    _id: false,
    type: { type: String, enum: ['LOCAL', 'OAUTH', 'WEB3'], required: true },
    provider: { type: String, enum: ['LOCAL', 'GOOGLE', 'WEB3AUTH', 'METAMASK'], required: true },
    provider_id: { type: String, required: true },
    password_hash: { type: String },
    public_key: { type: String },
    added_at: { type: Date, default: Date.now }
  }],

  role: { type: String, enum: ['PENDING', 'PATIENT', 'DOCTOR', 'ADMIN'], default: 'PENDING' },
  status: { type: String, enum: ['ACTIVE', 'BLOCKED'], default: 'ACTIVE' },
  kyc_info: {
    real_name: { type: String },
    license_number: { type: String },
    document_url: { type: String },
    approved_at: { type: Date }
  },
  last_login: { type: Date }
}, { timestamps: true })

// 2. MIDDLEWARE (HOOK): Tự động Hash password trước khi lưu
userSchema.pre('save', async function (next) {
  // Chỉ xử lý nếu mảng auth_providers có thay đổi
  if (!this.isModified('auth_providers')) return next()
  const localProvider = this.auth_providers.find(p => p.type === 'LOCAL')
  if (localProvider && localProvider.password_hash && !localProvider.password_hash.startsWith('$2')) {
    const salt = await bcrypt.genSalt(10)
    localProvider.password_hash = await bcrypt.hash(localProvider.password_hash, salt)
  }
  next()
})


// đối chiếu mật khẩu
userSchema.methods.matchPassword = async function (enteredPassword) {
  const localProvider = this.auth_providers.find(p => p.type === 'LOCAL')
  if (!localProvider || !localProvider.password_hash) {
    return false
  }
  return await bcrypt.compare(
    enteredPassword,
    localProvider.password_hash
  )
}

// đảm bảo không trùng provider_id (vd: không 2 user cùng 1 Google ID)
userSchema.index(
  { 'auth_providers.provider': 1, 'auth_providers.provider_id': 1 },
  { unique: true }
)
const User = mongoose.model('User', userSchema)
export default User