import mongoose, { Schema } from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'lab_techs';

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Lab Technician (kỹ thuật viên xét nghiệm)
 */
const labTechSchema = new mongoose.Schema(
    {
        // Liên kết tới user
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true, // mỗi user chỉ có 1 lab tech
        },

        // Họ tên kỹ thuật viên
        fullName: {
            type: String,
            required: true,
            minlength: 2, // tối thiểu 2 ký tự
        },

        // Giới tính
        gender: {
            type: String,
            enum: ['M', 'F'], // chỉ cho phép Nam/Nữ
            required: true,
        },

        // Danh sách chuyên môn (có thể nhiều)
        specialization: {
            type: [String],
            default: [],
        },

        // Số giấy phép hành nghề
        licenseNumber: {
            type: String,
            default: null,
        },

        // Ngày hết hạn giấy phép
        licenseExpiry: {
            type: Date,
            default: null,
        },

        // Khoa/phòng ban làm việc
        department: {
            type: String,
            default: null,
        },

        // Trạng thái đã được xác minh hay chưa
        isVerified: {
            type: Boolean,
            default: false,
        },

        // Thời điểm đăng nhập gần nhất
        lastLoginAt: {
            type: Date,
            default: null,
        },

        // Cờ xóa mềm (true = đã bị xóa)
        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true, // tự động tạo createdAt, updatedAt
        versionKey: false, // tắt __v
    },
);

/**
 * Khởi tạo model
 */
const LabTechModel = mongoose.model(COLLECTION_NAME, labTechSchema);

/**
 * Tìm lab technician theo userId
 */
const findOneByUserId = async (userId) => {
    return await LabTechModel.findOne({ userId: userId });
};

/**
 * Export các hàm thao tác
 */
export const labTechModel = {
    findOneByUserId,
};