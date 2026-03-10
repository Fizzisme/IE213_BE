// models/user.model.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'users';

const USER_ROLES = {
    PATIENT: 'PATIENT',
    DOCTOR: 'DOCTOR',
    ADMIN: 'ADMIN',
};

const authProviderSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['LOCAL', 'WALLET'],
            required: true,
        },
        nationId: {
            type: String,
        },
        email: {
            type: String,
        },
        passwordHash: {
            type: String,
        },
        walletAddress: {
            type: String,
        },
    },
    { _id: false },
);

const userSchema = new mongoose.Schema(
    {
        authProviders: {
            type: [authProviderSchema],
            required: true,
            validate: [(v) => v.length > 0, 'authProviders is required'],
        },

        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            required: true,
            default: USER_ROLES.PATIENT,
        },

        isActive: {
            type: Boolean,
            default: false,
            required: true,
        },

        _destroy: {
            type: Boolean,
            default: false,
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

userSchema.index({ 'authProviders.nationId': 1 }, { unique: true, sparse: true });
userSchema.index({ 'authProviders.email': 1 }, { unique: true, sparse: true });
userSchema.index({ 'authProviders.walletAddress': 1 }, { unique: true, sparse: true });

const UserModel = mongoose.model(COLLECTION_NAME, userSchema);

const createNew = async (data) => {
    return await UserModel.create(data);
};

const findByPhoneHash = async (phoneHash) => {
    return await UserModel.findOne({
        'authProviders.phoneHash': phoneHash,
        _destroy: false,
    }).lean();
};

const findByNationId = async (nationId) => {
    return await UserModel.findOne({
        'authProviders.nationId': nationId,
    });
};

const findByWalletAddress = async (walletAddress) => {
    return await UserModel.findOne({
        'authProviders.walletAddress': walletAddress,
        _destroy: false,
    }).lean();
};

const findById = async (userId) => {
    return await UserModel.findById(userId);
};

const updateById = async (userId, updateData) => {
    return await UserModel.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });
};

export const userModel = {
    USER_ROLES,
    UserModel,
    createNew,
    findByPhoneHash,
    findByNationId,
    findByWalletAddress,
    findById,
    updateById,
};
