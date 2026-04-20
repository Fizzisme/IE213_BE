import mongoose from 'mongoose';

const COLLECTION_NAME = 'test_results';

const TEST_RESULT_TYPES = {
    GENERAL: 'GENERAL',
    HIV_TEST: 'HIV_TEST',
    DIABETES_TEST: 'DIABETES_TEST',
    LAB_RESULT: 'LAB_RESULT',
};

const testResultSchema = new mongoose.Schema(
    {
        // Link to LabOrder (source of rawData, blockchain records)
        labOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'lab_orders',
            required: true,
            index: true,
        },

        medicalRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'medical_records',
            required: true,
        },

        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
        },

        testType: {
            type: String,
            enum: Object.values(TEST_RESULT_TYPES),
        },

        //  ONLY aiAnalysis stored here (NO rawData - that stays in LabOrder)
        aiAnalysis: { type: Object },

        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    }
);

const TestResultModel = mongoose.model(COLLECTION_NAME, testResultSchema);

const createNew = async (data) => {
    return await TestResultModel.create(data);
};

const findOneById = async (id) => {
    return await TestResultModel.findOne({ _id: id, _destroy: false });
};

const findByLabOrderId = async (labOrderId) => {
    return await TestResultModel.findOne({ labOrderId, _destroy: false });
};

export const testResultModel = {
    TestResultModel,
    TEST_RESULT_TYPES,
    createNew,
    findOneById,
    findByLabOrderId,
};
