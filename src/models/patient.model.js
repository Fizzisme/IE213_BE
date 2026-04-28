// models/patient.model.js
import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'patients';

/**
 * Enum trạng thái bệnh nhân
 */
const PATIENT_STATUS = {
    ACTIVE: 'ACTIVE',     // Đang hoạt động
    INACTIVE: 'INACTIVE', // Không hoạt động
    DECEASED: 'DECEASED', // Đã qua đời
};

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Patient
 */
const patientSchema = new mongoose.Schema(
    {
        // Liên kết tới user
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true, // mỗi user chỉ có 1 patient
        },

        // Họ tên bệnh nhân
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

        // Năm sinh
        birthYear: {
            type: Number,
            min: 1900, // năm tối thiểu
            max: new Date().getFullYear(), // không vượt quá năm hiện tại
            required: true,
        },

        // Số điện thoại
        phoneNumber: {
            type: String,
            required: true,
        },

        // Ảnh đại diện
        avatar: {
            type: String,
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
 * Index tối ưu tìm kiếm theo số điện thoại
 * - unique: không trùng
 * - sparse: chỉ áp dụng với document có field này
 */
patientSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

/**
 * Khởi tạo model
 */
const PatientModel = mongoose.model(COLLECTION_NAME, patientSchema);

/**
 * Tạo bệnh nhân mới
 */
const createNew = async (data) => {
    return await PatientModel.create(data);
};

/**
 * Lấy danh sách tất cả bệnh nhân
 * - Chỉ select các field cần thiết
 * - Sắp xếp mới nhất trước
 */
const getAll = async () => {
    return await PatientModel.find()
        .select('_id userId fullName gender birthYear phoneNumber createdAt')
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Tìm bệnh nhân theo userId
 * - Chỉ lấy record chưa bị xóa mềm
 */
const findByUserId = async (userId) => {
    return await PatientModel.findOne({
        userId,
        deletedAt: null,
    })
        .select('_id userId fullName gender birthYear phoneNumber createdAt')
        .lean();
};

/**
 * Tìm bệnh nhân theo nationId
 * - Lưu ý: field nationId chưa được định nghĩa trong schema
 */
const findByNationId = async (nationId) => {
    return await PatientModel.findOne({
        nationId: nationId,
    });
};

/**
 * Tìm bệnh nhân theo ID
 */
const findById = async (patientId) => {
    return await PatientModel.findById(patientId);
};

/**
 * Cập nhật thông tin bệnh nhân theo ID
 * - new: true → trả về dữ liệu sau khi update
 * - runValidators: kiểm tra validate schema
 */
const updateById = async (patientId, updateData) => {
    return await PatientModel.findByIdAndUpdate(
        patientId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    );
};

/**
 * Xóa mềm bệnh nhân theo patientId
 * - Cập nhật deletedAt và status
 * - Lưu ý: schema hiện tại chưa có field status
 */
const softDelete = async (patientId) => {
    return await PatientModel.findByIdAndUpdate(
        patientId,
        {
            deletedAt: new Date(),
            status: PATIENT_STATUS.INACTIVE,
        },
        { new: true },
    );
};

/**
 * Xóa mềm bệnh nhân theo userId
 */
const softDeleteByUserId = async (userId) => {
    return await PatientModel.findOneAndUpdate(
        {
            userId,
            deletedAt: null,
        },
        {
            deletedAt: new Date(),
        },
        { new: true },
    );
};

/**
 * Export model và các hàm thao tác
 */
export const patientModel = {
    PATIENT_STATUS,
    PatientModel,
    createNew,
    getAll,
    findByUserId,
    findById,
    updateById,
    softDelete,
    softDeleteByUserId,
    findByNationId,
};