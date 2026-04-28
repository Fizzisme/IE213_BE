// models/user.model.js
import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'users';

/**
 * Enum role của user
 */
const USER_ROLES = {
    PATIENT: 'PATIENT',     // Bệnh nhân
    DOCTOR: 'DOCTOR',       // Bác sĩ
    ADMIN: 'ADMIN',         // Quản trị viên
    LAB_TECH: 'LAB_TECH',   // Kỹ thuật viên xét nghiệm
};

/**
 * Enum trạng thái user
 */
const USER_STATUS = {
    PENDING: 'PENDING',     // Chờ duyệt
    ACTIVE: 'ACTIVE',       // Đã kích hoạt
    REJECTED: 'REJECTED',   // Bị từ chối
    INACTIVE: 'INACTIVE',   // Ngừng hoạt động
};

/**
 * Schema cho từng phương thức đăng nhập (Local / Wallet)
 */
const authProviderSchema = new mongoose.Schema(
    {
        // Loại đăng nhập
        type: {
            type: String,
            enum: ['LOCAL', 'WALLET'],
            required: true,
        },

        // CCCD / CMND
        nationId: {
            type: String,
        },

        // Email
        email: {
            type: String,
        },

        // Mật khẩu đã hash
        passwordHash: {
            type: String,
        },

        // Địa chỉ ví
        walletAddress: {
            type: String,
        },
    },
    { _id: false }, // không tạo _id cho subdocument
);

/**
 * Schema chính của User
 */
const userSchema = new mongoose.Schema(
    {
        // Danh sách phương thức đăng nhập
        authProviders: {
            type: [authProviderSchema],
            required: true,
            validate: [(v) => v.length > 0, 'authProviders is required'], // phải có ít nhất 1 provider
        },

        // Role của user
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            required: true,
            default: USER_ROLES.PATIENT,
        },

        // Cờ xóa mềm
        _destroy: {
            type: Boolean,
            default: false,
            required: true,
        },

        // Trạng thái tài khoản
        status: {
            type: String,
            enum: Object.values(USER_STATUS),
            default: USER_STATUS.PENDING,
            index: true, // tối ưu query theo status
        },

        // Đã tạo profile hay chưa
        hasProfile: {
            type: Boolean,
            default: false,
        },

        // Thời điểm được duyệt
        approvedAt: {
            type: Date,
            default: null,
        },

        // Người duyệt (admin)
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: COLLECTION_NAME,
            default: null,
        },

        // Lý do từ chối
        rejectionReason: {
            type: String,
            default: null,
        },

        // Chữ ký số (EIP-712) phục vụ gasless transaction
        registrationSignature: {
            type: String,
        },

        /**
         * Metadata blockchain
         */
        blockchainMetadata: {
            isSynced: { type: Boolean, default: false }, // đã sync lên chain chưa
            txHash: { type: String },                    // transaction hash
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
        versionKey: false, // tắt __v
    },
);

/**
 * Index phục vụ tìm kiếm nhanh và đảm bảo unique
 */

// CCCD không trùng
userSchema.index({ 'authProviders.nationId': 1 }, { unique: true, sparse: true });

// Email không trùng
userSchema.index({ 'authProviders.email': 1 }, { unique: true, sparse: true });

// Wallet không trùng
userSchema.index({ 'authProviders.walletAddress': 1 }, { unique: true, sparse: true });

/**
 * Khởi tạo model
 */
const UserModel = mongoose.model(COLLECTION_NAME, userSchema);

/**
 * Tạo user mới
 */
const createNew = async (data) => {
    return await UserModel.create(data);
};

/**
 * Tìm user theo phoneHash (nếu có lưu)
 */
const findByPhoneHash = async (phoneHash) => {
    return await UserModel.findOne({
        'authProviders.phoneHash': phoneHash,
        _destroy: false,
    }).lean();
};

/**
 * Tìm user theo CCCD
 */
const findByNationId = async (nationId) => {
    return await UserModel.findOne({
        'authProviders.nationId': nationId,
    });
};

/**
 * Tìm user theo địa chỉ ví
 */
const findByWalletAddress = async (walletAddress) => {
    return await UserModel.findOne({
        'authProviders.walletAddress': walletAddress,
        _destroy: false,
    }).lean();
};

/**
 * Tìm user theo ID
 */
const findById = async (userId) => {
    return await UserModel.findById(userId);
};

/**
 * Cập nhật user theo ID
 */
const updateById = async (userId, updateData) => {
    return await UserModel.findByIdAndUpdate(
        userId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    );
};

/**
 * Lấy danh sách user theo status có phân trang
 */
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

/**
 * Lấy chi tiết user kèm thông tin admin đã duyệt
 */
const findDetailById = async (userId) => {
    return await UserModel.findOne({ _id: userId, _destroy: false })
        .populate('approvedBy', '_id role nationId')
        .lean();
};

/**
 * Lấy danh sách user đã bị soft delete
 */
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

/**
 * Soft delete user
 * - Không xóa khỏi DB
 * - Đánh dấu _destroy = true
 */
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

/**
 * Lấy danh sách user có filter + search + phân trang
 */
const getAll = async ({ status, search, page = 1, limit = 20 } = {}) => {
    const filter = {};

    // Lọc theo status
    if (status) filter.status = status.toUpperCase();

    // Tìm kiếm theo tên hoặc wallet
    if (search) {
        filter.$or = [
            { fullName: { $regex: search, $options: 'i' } },
            { 'authProviders.walletAddress': { $regex: search, $options: 'i' } },
        ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    return await UserModel.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 });
};

/**
 * Export model và các hàm thao tác
 */
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
    getAll,
};