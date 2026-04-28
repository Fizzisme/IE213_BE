import mongoose from 'mongoose';

const { Schema } = mongoose;

// Tên collection trong MongoDB
const COLLECTION_NAME = 'audit_logs';

/**
 * Schema chi tiết bổ sung cho log
 * - Lưu thông tin thiết bị, IP, ghi chú
 */
const detailSchema = new Schema(
    {
        ip: { type: String, default: null },       // Địa chỉ IP
        device: { type: String, default: null },   // Thiết bị sử dụng
        note: { type: String, default: null },     // Ghi chú thêm
    },
    { _id: false }, // Không tạo _id cho schema con
);

/**
 * Schema chính cho Audit Log
 * - Dùng để lưu lại toàn bộ hành động quan trọng trong hệ thống
 */
const auditLogSchema = new Schema(
    {
        // ID user thực hiện hành động
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            default: null,
        },

        // Địa chỉ ví (trường hợp đăng nhập bằng wallet)
        walletAddress: {
            type: String,
            default: null,
            index: true, // index để truy vấn nhanh
        },

        // Loại hành động
        action: {
            type: String,
            enum: [
                'LOGIN_LOCAL',                 // đăng nhập bằng tài khoản
                'LOGIN_WALLET',                // đăng nhập bằng ví
                'ADMIN_OVERRIDE',              // admin override
                'REGISTER_USER',               // đăng ký user
                'CREATE_PATIENT',              // tạo bệnh nhân
                'CREATE_MEDICAL_RECORD',       // tạo hồ sơ bệnh án
                'CREATE_TEST_RESULT',          // tạo kết quả xét nghiệm
                'ADMIN_APPROVE_INIT',          // admin duyệt khởi tạo
                'VERIFY_ONBOARDING',           // verify onboarding
                'VERIFY_STAFF_REGISTRATION',   // verify đăng ký nhân sự
                'DIAGNOSIS_MEDICAL_RECORD',    // chẩn đoán bệnh án
                'VERIFY_BLOCKCHAIN_SYNC',      // verify đồng bộ blockchain
            ],
            required: true,
        },

        // Loại entity liên quan
        entityType: {
            type: String,
            enum: ['MEDICAL_RECORD', 'AUDIT_LOG', 'PATIENT', 'USER', 'TEST_RESULT'],
            default: null,
        },

        // ID của entity liên quan
        entityId: {
            type: Schema.Types.ObjectId,
            default: null,
        },

        // Dữ liệu trước khi thay đổi
        oldData: {
            type: Schema.Types.Mixed,
            default: null,
        },

        // Dữ liệu sau khi thay đổi
        newData: {
            type: Schema.Types.Mixed,
            default: null,
        },

        // Transaction hash trên blockchain
        txHash: {
            type: String,
            default: null,
            index: true,
        },

        // ChainId (ví dụ: Sepolia, Mainnet...)
        chainId: {
            type: Number,
            default: null,
        },

        // Trạng thái transaction/blockchain
        status: {
            type: String,
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            default: 'PENDING',
        },

        // Thông báo lỗi nếu transaction thất bại
        errorMessage: {
            type: String,
            default: null,
        },

        // Thông tin chi tiết bổ sung (IP, device...)
        details: {
            type: detailSchema,
            default: null,
        },

        // Thời gian tạo log (không thay đổi)
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        versionKey: false, // tắt __v
    },
);

/**
 * Index tối ưu truy vấn
 */

// Lấy log theo user và sắp xếp theo thời gian
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Lấy log theo entity
auditLogSchema.index({ entityType: 1, entityId: 1 });

// Tìm theo txHash (blockchain)
auditLogSchema.index({ txHash: 1 });

/**
 * Khởi tạo model
 */
const AuditLogModel = mongoose.model(COLLECTION_NAME, auditLogSchema);

/**
 * Tạo log mới
 */
const createLog = async (data) => {
    return await AuditLogModel.create(data);
};

/**
 * Lấy log theo entity (ví dụ: medical record, patient...)
 */
const getLogsByEntity = async (entityType, entityId) => {
    return await AuditLogModel.find({
        entityType,
        entityId,
    })
        .sort({ createdAt: -1 }) // mới nhất trước
        .lean();
};

/**
 * Lấy log theo user
 */
const getLogsByUser = async (userId) => {
    return await AuditLogModel.find({ userId })
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Cập nhật trạng thái transaction blockchain
 * - status: PENDING / SUCCESS / FAILED
 * - errorMessage: thông báo lỗi nếu có
 */
const updateTxStatus = async (logId, status, errorMessage = null) => {
    return await AuditLogModel.findByIdAndUpdate(
        logId,
        {
            status,
            errorMessage,
        },
        { new: true }, // trả về dữ liệu sau khi update
    );
};

/**
 * Export model và các hàm thao tác
 */
export const auditLogModel = {
    AuditLogModel,
    createLog,
    getLogsByEntity,
    getLogsByUser,
    updateTxStatus,
};