import mongoose from 'mongoose';

const COLLECTION_NAME = 'medical_records';

const MEDICAL_RECORD_TYPES = {
    HIV_TEST: 'HIV_TEST',
    LAB_RESULT: 'LAB_RESULT',
    PRESCRIPTION: 'PRESCRIPTION',
    //     ...
};

const MEDICAL_RECORD_STATUS = {
    ACTIVE: 'ACTIVE',
    REVOKED: 'REVOKED',
};

const medicalRecordSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },

        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'doctors',
            required: true,
        },

        // Created by Who??
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
        },

        type: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_TYPES),
            required: true,
        },

        refId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_STATUS),
            default: MEDICAL_RECORD_STATUS.ACTIVE,
        },

        auditLogId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'audit_logs',
            default: null,
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

// Chống trùng record logic
medicalRecordSchema.index({ type: 1, refId: 1 }, { unique: true });

const MedicalRecordModel = mongoose.model(COLLECTION_NAME, medicalRecordSchema);

const createNew = async (data) => {
    return await MedicalRecordModel.create(data);
};

const findByPatientId = async (patientId) => {
    return await MedicalRecordModel.find({
        patientId,
        status: MEDICAL_RECORD_STATUS.ACTIVE,
        _destroy: false,
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

export const medicalRecordModel = {
    MEDICAL_RECORD_TYPES,
    MEDICAL_RECORD_STATUS,
    MedicalRecordModel,
    createNew,
    findByPatientId,
    revokeRecord,
};
