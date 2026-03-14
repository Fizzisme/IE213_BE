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
    INACTIVE: 'INACTIVE',
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

        _destroy: {
            type: Boolean,
            default: false,
            required: true,
        },

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

// Lấy detail kèm thông tin admin duyệt (populate approvedBy)
const findDetailById = async (userId) => {
    return await UserModel.findOne({ _id: userId, _destroy: false })
        .populate('approvedBy', '_id role nationId')
        .lean();
};
// Lấy danh sách user đã bị soft delete
const findDeleted = async ({ page, limit }) => {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        UserModel.find({ _destroy: true })
            .select('-__v')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        UserModel.countDocuments({ _destroy: true }),
    ]);
    return { data, total, page, limit };
};

// Soft delete user đánh dấu là user bị xóa chứ chưa xóa ra khỏi db
const softDelete = async (userId) => {
    return await UserModel.findByIdAndUpdate(
        userId,
        {
            _destroy: true,
            status: USER_STATUS.INACTIVE,
        },
        { new: true },
    );
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
    findByStatus,
    findDetailById,
    findDeleted,
    softDelete,
};
