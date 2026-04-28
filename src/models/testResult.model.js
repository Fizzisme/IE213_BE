import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'test_results';

/**
 * Enum loại xét nghiệm
 */
const TEST_RESULT_TYPES = {
    DIABETES_TEST: 'DIABETES_TEST', // Xét nghiệm tiểu đường
};

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Test Result (kết quả xét nghiệm)
 */
const testResultSchema = new mongoose.Schema(
    {
        // Liên kết tới hồ sơ bệnh án
        medicalRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'medical_record',
            required: true,
        },

        // ID bệnh nhân
        patientId: {
            type: mongoose.Types.ObjectId,
            ref: 'Patient',
            required: true,
        },

        // Người tạo kết quả (lab technician)
        createdBy: {
            type: mongoose.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Loại xét nghiệm
        testType: {
            type: String,
            enum: Object.values(TEST_RESULT_TYPES),
        },

        // Dữ liệu thô từ xét nghiệm (máy móc, thiết bị)
        rawData: {
            type: Object,
        },

        // Phân tích từ AI (nếu có)
        aiAnalysis: {
            type: Object,
        },

        /**
         * Metadata liên quan blockchain
         */
        blockchainMetadata: {
            isSynced: { type: Boolean, default: false }, // đã sync lên blockchain chưa
            txHash: { type: String },                    // transaction hash
            onChainHash: { type: String },               // hash dữ liệu lưu on-chain
            syncAt: { type: Date },                      // thời điểm sync
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
 * Khởi tạo model
 */
const TestResultModel = new mongoose.model(COLLECTION_NAME, testResultSchema);

/**
 * Tạo kết quả xét nghiệm mới
 */
const createNew = async (data) => {
    return await TestResultModel.create(data);
};

/**
 * Tìm kết quả xét nghiệm theo ID
 */
const findOneById = async (id) => {
    return await TestResultModel.findOne({ _id: id });
};

/**
 * Export model và các hàm thao tác
 */
export const testResultModel = {
    TestResultModel,
    createNew,
    findOneById,
};