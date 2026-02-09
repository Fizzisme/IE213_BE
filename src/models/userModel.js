// models/userModel.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'users';

const USER_ROLES = {
    PATIENT: 'PATIENT',
    DOCTOR: 'DOCTOR',
    ADMIN: 'ADMIN',
};

const USER_STATUS = {
    ACTIVE: 'ACTIVE',
    BLOCKED: 'BLOCKED',
};

const authProviderSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['PHONE', 'WALLET'],
            required: true,
        },
        phoneHash: {
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

        nationId: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(USER_STATUS),
            default: USER_STATUS.ACTIVE,
        },

        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

userSchema.index({ nationId: 1 }, { unique: true, sparse: true });
userSchema.index({ 'authProviders.phoneHash': 1 }, { unique: true, sparse: true });

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
    USER_STATUS,
    UserModel,
    createNew,
    findByPhoneHash,
    findByWalletAddress,
    findById,
    updateById,
};
