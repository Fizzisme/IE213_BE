import mongoose from 'mongoose'

const patientSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Dữ liệu định danh cá nhân (Mã hóa hoàn toàn)
  encrypted_identity: {
    name: {
      encrypted_data: String,
      iv: String
    },
    cid: {
      encrypted_data: String,
      iv: String
    }
  },
  // Dữ liệu nhân khẩu học (Có thể để plaintext để bác sĩ lọc/thống kê nhanh)
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
  year_of_birth: { type: Number }, // Chỉ lưu năm sinh để bảo mật hơn ngày sinh
  // Blind Index: Dùng để tìm kiếm bệnh nhân qua SĐT mà không lộ SĐT
  phone_number_hash: { type: String, index: true },
  // Trạng thái hồ sơ
  is_deleted: { type: Boolean, default: false }
}, { timestamps: true })

// Tạo chỉ mục để tìm kiếm nhanh theo năm sinh hoặc giới tính nếu cần làm báo cáo
patientSchema.index({ gender: 1, year_of_birth: 1 })

const Patient = mongoose.model('Patient', patientSchema)
export default Patient