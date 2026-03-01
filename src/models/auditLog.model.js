import mongoose from 'mongoose';

const { Schema } = mongoose;

const COLLECTION_NAME = 'audit_logs';

const detailSchema = new Schema(
    {
        ip: { type: String, default: null },
        device: { type: String, default: null },
        recordId: { type: Schema.Types.ObjectId, default: null },
        note: { type: String, default: null },
    },
    { _id: false },
);

const auditLogSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            default: null,
        },

        walletAddress: {
            type: String,
            default: null,
            index: true,
        },

        action: {
            type: String,
            enum: [
                'LOGIN_PHONE',
                'LOGIN_WALLET',
                'CREATE_HIV_TEST',
                'SUBMIT_HIV_TEST',
                'ADMIN_OVERRIDE',
                'REGISTER_PATIENT',
            ],
            required: true,
        },

        entityType: {
            type: String,
            enum: ['HIV_TEST', 'MEDICAL_RECORD', 'AUDIT_LOG', 'PATIENT', 'USER'],
            default: null,
        },
        entityId: {
            type: Schema.Types.ObjectId,
            default: null,
        },

        txHash: {
            type: String,
            default: null,
            index: true,
        },
        chainId: {
            type: Number,
            default: null,
        },
        status: {
            type: String,
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            default: 'PENDING',
        },
        errorMessage: {
            type: String,
            default: null,
        },

        details: {
            type: detailSchema,
            default: null,
        },

        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        versionKey: false,
    },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

auditLogSchema.index({ entityType: 1, entityId: 1 });

auditLogSchema.index({ txHash: 1 });

const AuditLogModel = mongoose.model(COLLECTION_NAME, auditLogSchema);

const createLog = async (data) => {
    return await AuditLogModel.create(data);
};

const getLogsByEntity = async (entityType, entityId) => {
    return await AuditLogModel.find({
        entityType,
        entityId,
    })
        .sort({ createdAt: -1 })
        .lean();
};

const getLogsByUser = async (userId) => {
    return await AuditLogModel.find({ userId })
        .sort({ createdAt: -1 })
        .lean();
};

const updateTxStatus = async (logId, status, errorMessage = null) => {
    return await AuditLogModel.findByIdAndUpdate(
        logId,
        {
            status,
            errorMessage,
        },
        { new: true },
    );
};

export const auditLogModel = {
    AuditLogModel,
    createLog,
    getLogsByEntity,
    getLogsByUser,
    updateTxStatus,
};
