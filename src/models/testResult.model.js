import mongoose from 'mongoose';

const COLLECTION_NAME = 'test_results';

const TEST_RESULT_TYPES = {
    DIABETES_TEST: 'DIABETES_TEST',
};

const testResultSchema = new mongoose.Schema(
    {
        medicalRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'medical_record',
            required: true,
        },
        patientId: { type: mongoose.Types.ObjectId, ref: 'Patient', required: true },
        createdBy: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
        testType: {
            type: String,
            enum: Object.values(TEST_RESULT_TYPES),
        },
        rawData: { type: Object },
        aiAnalysis: { type: Object },
        blockchainMetadata: {
            isSynced: { type: Boolean, default: false },
            txHash: { type: String },
            onChainHash: { type: String },
            syncAt: { type: Date }
        },
        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    },
);

const TestResultModel = new mongoose.model(COLLECTION_NAME, testResultSchema);

const createNew = async (data) => {
    return await TestResultModel.create(data);
};

const findOneById = async (id) => {
    return await TestResultModel.findOne({ _id: id });
};

export const testResultModel = {
    TestResultModel,
    createNew,
    findOneById,
};
