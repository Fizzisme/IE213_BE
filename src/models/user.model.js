// models/user.model.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'users';

const USER_ROLES = {
    PATIENT: 'PATIENT',
    DOCTOR: 'DOCTOR',
    ADMIN: 'ADMIN',
};

const USER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  INACTIVE: 'INACTIVE'
}

const authProviderSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['LOCAL', 'WALLET'],
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

         // ===== Thêm các trường admin approval field vào trong nx  =====
        status: {
            type: String,
            enum: Object.values(USER_STATUS),
            default: USER_STATUS.PENDING,
            index: true,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: COLLECTION_NAME,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
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

const findByNationId = async (nationId) => {
    return await UserModel.findOne({
        nationId: nationId,
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
// Lấy danh sách user theo status, có phân trang
const findByStatus = async ({ status, page, limit }) => {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        UserModel.find({ status, _destroy: false })
            .select('-__v')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        UserModel.countDocuments({ status, _destroy: false }),
    ]);
    return { data, total, page, limit };
};


export const userModel = {
    USER_ROLES,
    USER_STATUS,
    UserModel,
    createNew,
    findByPhoneHash,
    findByNationId,
    findByWalletAddress,
    findById,
    updateById,
    findByStatus
};
