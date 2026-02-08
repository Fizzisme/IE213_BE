import mongoose from 'mongoose';

const { Schema } = mongoose;

const COLLECTION_NAME = 'admins';

const adminSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
        },

        permissions: {
            type: [String],
            default: ['VIEW_AUDIT_LOG', 'VIEW_MEDICAL_RECORD', 'VIEW_HIV_TEST'],
        },

        status: {
            type: String,
            enum: ['ACTIVE', 'SUSPENDED'],
            default: 'ACTIVE',
        },

        lastLoginAt: {
            type: Date,
            default: null,
        },

        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// CMS search
adminSchema.index({ email: 1 });
adminSchema.index({ status: 1 });

adminSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const AdminModel = mongoose.model(COLLECTION_NAME, adminSchema);

const createAdmin = async (data) => {
    return await AdminModel.create(data);
};

const getAdminByUserId = async (userId) => {
    return await AdminModel.findOne({ userId }).lean();
};

const getAdminById = async (adminId) => {
    return await AdminModel.findById(adminId).lean();
};

const updateAdmin = async (adminId, data) => {
    return await AdminModel.findByIdAndUpdate(adminId, data, {
        new: true,
        runValidators: true,
    });
};

const softDeleteAdmin = async (adminId) => {
    return await AdminModel.findByIdAndUpdate(adminId, { deletedAt: new Date(), status: 'SUSPENDED' }, { new: true });
};

export const adminModel = {
    AdminModel,
    createAdmin,
    getAdminByUserId,
    getAdminById,
    updateAdmin,
    softDeleteAdmin,
};
