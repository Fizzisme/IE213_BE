import mongoose from 'mongoose';

const COLLECTION_NAME = 'medical_records';

const MEDICAL_RECORD_TYPES = {
    HIV_TEST: 'HIV_TEST',
    LAB_RESULT: 'LAB_RESULT',
    PRESCRIPTION: 'PRESCRIPTION',
    DIABETES_TEST: 'DIABETES_TEST',
};

const MEDICAL_RECORD_STATUS = {
    CREATED: 'CREATED',
    WAITING_RESULT: 'WAITING_RESULT',
    HAS_RESULT: 'HAS_RESULT',
    DIAGNOSED: 'DIAGNOSED',
    COMPLETE: 'COMPLETE',
};

const medicalRecordSchema = new mongoose.Schema(
    {
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

        testResultId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'test_results',
        },

        type: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_TYPES),
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_STATUS),
            default: MEDICAL_RECORD_STATUS.CREATED,
        },

        note: {
            type: String,
        },

        diagnosis: {
            type: String,
        },

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

// Lấy hồ sơ theo bệnh nhân
medicalRecordSchema.index({ patientId: 1, createdAt: -1 });

// Truy vấn theo loại
medicalRecordSchema.index({ type: 1 });

const MedicalRecordModel = mongoose.model(COLLECTION_NAME, medicalRecordSchema);

const createNew = async (data) => {
    return await MedicalRecordModel.create(data);
};

const findOneById = async (id) => {
    return await MedicalRecordModel.findOne({ _id: id, _destroy: false });
};

const findOneByPatientId = async (patientId, status) => {
    return await MedicalRecordModel.find({
        patientId,
        _destroy: false,
        status: { $in: status },
    }).sort({ createdAt: -1 });
};

const revokeRecord = async (recordId, auditLogId) => {
    return await MedicalRecordModel.findByIdAndUpdate(
        recordId,
        {
            status: MEDICAL_RECORD_STATUS.REVOKED,
            auditLogId,
        },
        { new: true },
    );
};

const update = async (medicalRecordId, record) => {
    return await MedicalRecordModel.updateOne({ _id: medicalRecordId }, { $set: record });
};

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
