import { userModel } from '~/models/user.model';
import { patientModel } from '~/models/patient.model';
import { auditLogModel } from '~/models/auditLog.model';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { env } from '~/config/environment';
import { JwtProvider } from '~/providers/JwtProvider';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
// Hàm đăng ký local
const register = async (payload) => {
    // Tìm người dùng trong DB
    const userExisted = await userModel.findByNationId(payload.nationId);
    // Nếu người dùng tồn tại thì ném ra lỗi
    if (userExisted) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Người dùng đã tồn tại');

    // Tạo người dùng
    const user = await userModel.createNew({
        authProviders: [
            payload.nationId && {
                type: 'LOCAL',
                nationId: payload.nationId,
                email: payload.email,
                passwordHash: bcrypt.hashSync(payload.password, 8),
            },
        ].filter(Boolean),
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: user._id,
        action: 'REGISTER_USER',
        entityType: 'USER',
        entityId: user._id,
    });

    return {
        userId: user._id,
    };
};

const NONCE_STORE = new Map();

// Hàm tạo nonce wallet
const createWalletNonce = async (walletAddress) => {
    if (!walletAddress) throw new ApiError(StatusCodes.NOT_FOUND, 'Wallet address required');
    // Tạo nonce trả về cho client
    const nonce = `Login ${Date.now()} - ${uuidv4()}`;
    // Lưu nonce vào store
    NONCE_STORE.set(walletAddress.toLowerCase(), nonce);
    return nonce;
};

// Hàm verify walletAddress
const verifyWalletLogin = async (walletAddress, signature) => {
    // Lấy nonce từ store
    const nonce = NONCE_STORE.get(walletAddress.toLowerCase());
    // Nếu không có trả về lỗi
    if (!nonce) throw new ApiError(StatusCodes.NOT_FOUND, 'Nonce đã hết hạn');

    const recovered = ethers.verifyMessage(nonce, signature);

    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Signature không hợp lệ');
    }

    NONCE_STORE.delete(walletAddress.toLowerCase());
    let user = await userModel.findByWalletAddress(walletAddress);
    // Lần đầu đăng nhập thì tạo tài khoản qua wallet
    if (!user)
        user = await userModel.createNew({
            authProviders: [
                walletAddress && {
                    type: 'WALLET',
                    walletAddress,
                },
            ].filter(Boolean),
        });

    await auditLogModel.createLog({
        userId: user._id,
        walletAddress,
        action: 'LOGIN_WALLET',
        entityType: 'USER',
        entityId: user._id,
    });

    // Kiểm tra trạng thái tài khoản trước khi cấp token
    switch (user.status) {
        case 'PENDING':
            throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đang chờ admin duyệt');
        case 'REJECTED':
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Tài khoản đã bị từ chối. Lý do: ${user.rejectionReason || 'Không rõ'}`,
            );
        case 'INACTIVE':
            throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
        case 'ACTIVE':
            // Cho phép đăng nhập bình thường
            break;
        default:
            throw new ApiError(StatusCodes.FORBIDDEN, 'Trạng thái tài khoản không hợp lệ');
    }

    // Tạo ra thông tin người dùng để mã hóa vào token
    const userInfo = {
        _id: user._id,
        role: user.role,
    };
    // Tạo ra 2 loại token
    const accessToken = await JwtProvider.generateToken(
        userInfo,
        env.ACCESS_TOKEN_SECRET_SIGNATURE,
        env.ACCESS_TOKEN_LIFE,
    );
    const refreshToken = await JwtProvider.generateToken(
        userInfo,
        env.REFRESH_TOKEN_SECRET_SIGNATURE,
        env.REFRESH_TOKEN_LIFE,
    );

    return {
        accessToken,
        refreshToken,
        role: user.role,
        status: user.status,
        hasProfile: user.hasProfile,
    };
};

// Hàm đăng nhập bằng cccd/cmnd
const loginByNationId = async (data) => {
    const { nationId, password } = data;
    // Tìm người dùng trong DB
    const userExisted = await userModel.findByNationId(nationId);
    // Generic message để tránh lộ thông tin account
    if (!userExisted) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');

    // Tài khoản ADMIN phải đi qua route login admin riêng
    if (userExisted.role === userModel.USER_ROLES.ADMIN) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản ADMIN vui lòng đăng nhập tại /v1/admin/auth/login');
    }

    if (userExisted._destroy) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
    }

    // Tìm phương thức đăng nhập local
    const localProvider = userExisted?.authProviders.find((p) => p.type === 'LOCAL');
    if (!localProvider) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');
    if (!bcrypt.compareSync(password, localProvider.passwordHash)) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Sai Mật khẩu');
    }

    // Kiểm tra trạng thái tài khoản trước khi cấp token
    switch (userExisted.status) {
        case 'PENDING':
            throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đang chờ admin duyệt');
        case 'REJECTED':
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Tài khoản đã bị từ chối. Lý do: ${userExisted.rejectionReason || 'Không rõ'}`,
            );
        case 'INACTIVE':
            throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
        case 'ACTIVE':
            // Cho phép đăng nhập bình thường
            break;
        default:
            throw new ApiError(StatusCodes.FORBIDDEN, 'Trạng thái tài khoản không hợp lệ');
    }

    // Tạo ra thông tin người dùng để mã hóa vào token
    const userInfo = {
        _id: userExisted._id,
        role: userExisted.role,
    };
    // Tạo ra 2 loại token
    const accessToken = await JwtProvider.generateToken(
        userInfo,
        env.ACCESS_TOKEN_SECRET_SIGNATURE,
        env.ACCESS_TOKEN_LIFE,
    );
    const refreshToken = await JwtProvider.generateToken(
        userInfo,
        env.REFRESH_TOKEN_SECRET_SIGNATURE,
        env.REFRESH_TOKEN_LIFE,
    );

    return {
        accessToken,
        refreshToken,
        role: userExisted.role,
        status: userExisted.status,
        hasProfile: userExisted.hasProfile,
    };
};

const getMe = async (user) => {
    const userExisted = await userModel.findById(user._id);
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy người dùng');
    return {
        userId: userExisted._id,
        role: userExisted.role,
        status: userExisted.status,
        hasProfile: userExisted.hasProfile,
    };
};

export const authService = {
    register,
    loginByNationId,
    createWalletNonce,
    verifyWalletLogin,
    getMe,
};
