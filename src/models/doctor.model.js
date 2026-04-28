// models/doctor.model.js
import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'doctors';

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Doctor
 */
const doctorSchema = new mongoose.Schema(
    {
        // Liên kết tới user (mỗi doctor tương ứng 1 user)
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true, // đảm bảo mỗi user chỉ có 1 doctor
            index: true,  // tối ưu truy vấn theo userId
        },

        // Họ tên bác sĩ
        fullName: {
            type: String,
            required: true,
            trim: true, // loại bỏ khoảng trắng đầu/cuối
        },

        // Chuyên môn (có thể nhiều chuyên khoa)
        specialization: {
            type: Array,
            required: true,
        },

        // Bệnh viện làm việc
        hospital: {
            type: String,
            default: '',
        },

        // Số giấy phép hành nghề
        licenseNumber: {
            type: String,
            default: null,
        },

        // Giới tính
        gender: {
            type: String,
            enum: ['M', 'F'], // chỉ cho phép Nam hoặc Nữ
            default: '',
        },

        // Email liên hệ
        email: {
            type: String,
            default: null,
        },

        // Số điện thoại
        phoneNumber: {
            type: String,
            default: null,
        },

        // Năm sinh
        birthYear: {
            type: String,
            default: null,
        },

        // Trạng thái tài khoản
        status: {
            type: String,
            enum: ['ACTIVE', 'SUSPENDED'], // chỉ cho phép 2 trạng thái
            default: 'ACTIVE',
            index: true, // tối ưu query theo status
        },

        // Trường phục vụ xóa mềm
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // tự động tạo createdAt, updatedAt
        versionKey: false, // tắt __v
    },
);

/**
 * Tạo index để tối ưu truy vấn
 */
doctorSchema.index({ specialization: 1 }); // tìm theo chuyên khoa
doctorSchema.index({ status: 1 });         // lọc theo trạng thái

/**
 * Khởi tạo model
 */
const DoctorModel = mongoose.model(COLLECTION_NAME, doctorSchema);

/**
 * Soft delete doctor theo userId
 * - Không xóa khỏi database
 * - Cập nhật deletedAt và status
 */
const softDeleteByUserId = async (userId) => {
    return await DoctorModel.findOneAndUpdate(
        {
            userId,
            deletedAt: null, // chỉ xử lý record chưa bị xóa
        },
        {
            deletedAt: new Date(),
            status: 'SUSPENDED',
        },
        { new: true }, // trả về dữ liệu sau update
    );
};

/**
 * Tìm doctor theo userId
 */
const findOneByUserId = async (userId) => {
    return await DoctorModel.findOne({ userId: userId });
};

/**
 * Export model và các hàm thao tác
 */
export const doctorModel = {
    DoctorModel,
    softDeleteByUserId,
    findOneByUserId,
};