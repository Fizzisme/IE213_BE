import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'medical_records';

/**
 * Enum loại hồ sơ bệnh án
 */
const MEDICAL_RECORD_TYPES = {
    HIV_TEST: 'HIV_TEST',             // Xét nghiệm HIV
    LAB_RESULT: 'LAB_RESULT',         // Kết quả xét nghiệm tổng quát
    PRESCRIPTION: 'PRESCRIPTION',     // Đơn thuốc
    DIABETES_TEST: 'DIABETES_TEST',   // Xét nghiệm tiểu đường
};

/**
 * Enum trạng thái hồ sơ bệnh án
 */
const MEDICAL_RECORD_STATUS = {
    CREATED: 'CREATED',               // Mới tạo
    WAITING_RESULT: 'WAITING_RESULT', // Đang chờ kết quả xét nghiệm
    HAS_RESULT: 'HAS_RESULT',         // Đã có kết quả
    DIAGNOSED: 'DIAGNOSED',           // Đã chẩn đoán
    COMPLETE: 'COMPLETE',             // Hoàn tất
};

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Medical Record
 */
const medicalRecordSchema = new mongoose.Schema(
    {
        // ID bệnh nhân
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },

        // Người tạo hồ sơ (doctor hoặc staff)
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
        },

        // Liên kết tới kết quả xét nghiệm
        testResultId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'test_results',
        },

        // Loại hồ sơ bệnh án
        type: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_TYPES),
            required: true,
        },

        // Trạng thái hồ sơ
        status: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_STATUS),
            default: MEDICAL_RECORD_STATUS.CREATED,
        },

        // Ghi chú lâm sàng (trước khi có kết quả)
        clinicalNote: {
            type: String,
        },

        // Ghi chú chẩn đoán
        diagnosisNote: {
            type: String,
        },

        // Ghi chú chung
        note: {
            type: String,
        },

        // Kết luận chẩn đoán
        diagnosis: {
            type: String,
        },

        /**
         * Metadata liên quan blockchain
         * - Lưu lại các txHash tương ứng với từng bước
         */
        blockchainMetadata: {
            createTxHash: { type: String },      // tx tạo record
            labTxHash: { type: String },         // tx từ lab
            diagnosisTxHash: { type: String },   // tx chẩn đoán
            isSynced: { type: Boolean, default: false }, // đã sync on-chain chưa
            syncAt: { type: Date }               // thời điểm sync
        },

        // Cờ xóa mềm
        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: {
            createdAt: true,  // chỉ lưu thời gian tạo
            updatedAt: false, // không lưu updatedAt
        },
        versionKey: false, // tắt __v
    },
);

/**
 * Index phục vụ truy vấn
 */

// Lấy hồ sơ theo bệnh nhân, sắp xếp mới nhất trước
medicalRecordSchema.index({ patientId: 1, createdAt: -1 });

// Lọc theo loại hồ sơ
medicalRecordSchema.index({ type: 1 });

/**
 * Khởi tạo model
 */
const MedicalRecordModel = mongoose.model(COLLECTION_NAME, medicalRecordSchema);

/**
 * Tạo hồ sơ bệnh án mới
 */
const createNew = async (data) => {
    return await MedicalRecordModel.create(data);
};

/**
 * Tìm 1 hồ sơ theo ID
 * - Chỉ lấy record chưa bị xóa mềm
 */
const findOneById = async (id) => {
    return await MedicalRecordModel.findOne({ _id: id, _destroy: false });
};

/**
 * Lấy danh sách hồ sơ theo patientId và status
 * - status là mảng (lọc theo nhiều trạng thái)
 */
const findOneByPatientId = async (patientId, status) => {
    return await MedicalRecordModel.find({
        patientId,
        _destroy: false,
        status: { $in: status },
    }).sort({ createdAt: -1 });
};

/**
 * Thu hồi (revoke) hồ sơ bệnh án
 * - Cập nhật trạng thái và lưu auditLogId
 */
const revokeRecord = async (recordId, auditLogId) => {
    return await MedicalRecordModel.findByIdAndUpdate(
        recordId,
        {
            status: MEDICAL_RECORD_STATUS.REVOKED, // chú ý: cần đảm bảo enum có giá trị này
            auditLogId,
        },
        { new: true },
    );
};

/**
 * Cập nhật thông tin hồ sơ bệnh án
 */
const update = async (medicalRecordId, record) => {
    return await MedicalRecordModel.updateOne(
        { _id: medicalRecordId },
        { $set: record }
    );
};

/**
 * Export model và các hàm thao tác
 */
export const medicalRecordModel = {
    MEDICAL_RECORD_TYPES,
    MEDICAL_RECORD_STATUS,
    MedicalRecordModel,
    createNew,
    findOneByPatientId,
    revokeRecord,
    findOneById,
    update,
};