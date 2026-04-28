import mongoose from 'mongoose';

const { Schema } = mongoose;

// Tên collection trong MongoDB
const COLLECTION_NAME = 'admins';

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Admin
 */
const adminSchema = new Schema(
    {
        // Liên kết tới bảng users (mỗi admin tương ứng 1 user)
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true, // đảm bảo 1 user chỉ có 1 admin
        },

        // Họ tên admin
        fullName: {
            type: String,
            required: true,
            trim: true, // tự động loại bỏ khoảng trắng đầu/cuối
        },

        // Email admin
        email: {
            type: String,
            required: true,
            lowercase: true, // tự động chuyển về chữ thường
        },

        // Danh sách quyền của admin
        permissions: {
            type: [String],
            default: ['VIEW_AUDIT_LOG', 'VIEW_MEDICAL_RECORD'], // quyền mặc định
        },

        // Trạng thái tài khoản
        status: {
            type: String,
            enum: ['ACTIVE', 'SUSPENDED'], // chỉ cho phép 2 giá trị này
            default: 'ACTIVE',
        },

        // Thời điểm đăng nhập gần nhất
        lastLoginAt: {
            type: Date,
            default: null,
        },

        // Thời điểm xóa mềm (soft delete)
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // tự động tạo createdAt và updatedAt
        versionKey: false, // tắt __v
    },
);

/**
 * Tạo index để tối ưu truy vấn
 */
adminSchema.index({ email: 1 });   // tìm theo email
adminSchema.index({ status: 1 });  // lọc theo trạng thái

/**
 * Middleware trước khi save
 * - Cập nhật lại thời gian updatedAt
 */
adminSchema.pre('save', function() {
    this.updatedAt = new Date();
});

/**
 * Khởi tạo model từ schema
 */
const AdminModel = mongoose.model(COLLECTION_NAME, adminSchema);

/**
 * Tạo admin mới
 */
const createAdmin = async (data) => {
    return await AdminModel.create(data);
};

/**
 * Lấy admin theo userId
 */
const getAdminByUserId = async (userId) => {
    return await AdminModel.findOne({ userId }).lean();
};

/**
 * Lấy admin theo adminId
 */
const getAdminById = async (adminId) => {
    return await AdminModel.findById(adminId).lean();
};

/**
 * Cập nhật thông tin admin
 * - new: true → trả về dữ liệu sau khi update
 * - runValidators: true → kiểm tra validate schema
 */
const updateAdmin = async (adminId, data) => {
    return await AdminModel.findByIdAndUpdate(adminId, data, {
        new: true,
        runValidators: true,
    });
};

/**
 * Xóa mềm admin
 * - Không xóa khỏi DB
 * - Chỉ cập nhật deletedAt và status
 */
const softDeleteAdmin = async (adminId) => {
    return await AdminModel.findByIdAndUpdate(
        adminId,
        {
            deletedAt: new Date(),
            status: 'SUSPENDED',
        },
        { new: true }
    );
};

/**
 * Export model và các hàm thao tác
 */
export const adminModel = {
    AdminModel,
    createAdmin,
    getAdminByUserId,
    getAdminById,
    updateAdmin,
    softDeleteAdmin,
};