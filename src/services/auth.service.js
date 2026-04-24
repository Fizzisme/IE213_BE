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
import { blockchainContracts } from '~/blockchain/contract';

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
    if (!user) {
        user = await userModel.createNew({
            authProviders: [
                {
                    type: 'WALLET',
                    walletAddress,
                },
            ],
            role: userModel.USER_ROLES.PATIENT,
            status: userModel.USER_STATUS.PENDING,
            blockchainAccount: {
                status: 'NONE',
            },
        });

        await auditLogModel.createLog({
            userId: user._id,
            walletAddress,
            action: 'WALLET_AUTO_REGISTER',
            entityType: 'USER',
            entityId: user._id,
            details: { note: 'Auto-created account for new wallet login' }
        });
    }

    await auditLogModel.createLog({
        userId: user._id,
        walletAddress,
        action: 'LOGIN_WALLET',
        entityType: 'USER',
        entityId: user._id,
    });

    // Kiểm tra trạng thái tài khoản
    // [SỬA ĐỔI]: Cho phép PENDING đăng nhập
    if (user.status === 'REJECTED') {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Tài khoản đã bị từ chối. Lý do: ${user.rejectionReason || 'Không rõ'}`,
        );
    }
    if (user.status === 'INACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
    }

    // ✅ Thêm walletAddress vào JWT
    const userInfo = {
        _id: user._id,
        role: user.role,
        walletAddress: walletAddress,
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
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản ADMIN vui lòng đăng nhập tại /v1/admins/auth/login');
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

    // [SỬA ĐỔI]: Cho phép PENDING đăng nhập
    if (userExisted.status === 'REJECTED') {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Tài khoản đã bị từ chối. Lý do: ${userExisted.rejectionReason || 'Không rõ'}`,
        );
    }
    if (userExisted.status === 'INACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
    }

    // ✅ Thêm walletAddress vào JWT (Cách 2: Hybrid approach)
    // Lấy wallet từ authProviders nếu có (patient có thể có cả LOCAL + WALLET)
    const walletAddress = userExisted.authProviders?.find(p => p.walletAddress)?.walletAddress;

    // Tạo ra thông tin người dùng để mã hóa vào token
    const userInfo = {
        _id: userExisted._id,
        role: userExisted.role,
        walletAddress: walletAddress || null,  // ← Thêm walletAddress vào token
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
        status: userExisted.status,
        hasProfile: userExisted.hasProfile,
    };
};

/**
 * Refresh access token using refresh token
 * Used by POST /v1/auth/refresh-token endpoint
 * 
 * @param {string} refreshToken - Refresh token from cookie
 * @returns {object} New accessToken + metadata
 */
const refreshAccessToken = async (refreshToken) => {
    if (!refreshToken) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Refresh token is required');
    }

    let decodedToken;
    try {
        decodedToken = await JwtProvider.verifyToken(
            refreshToken,
            env.REFRESH_TOKEN_SECRET_SIGNATURE,
        );
    } catch (error) {
        throw new ApiError(
            StatusCodes.UNAUTHORIZED,
            'Refresh token is invalid or expired. Please login again.'
        );
    }

    // Verify user still exists and is active
    const user = await userModel.findById(decodedToken._id);
    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User no longer exists');
    }

    if (user._destroy) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Account has been deleted');
    }

    // [SỬA ĐỔI]: Cho phép PENDING refresh token
    if (user.status === 'REJECTED' || user.status === 'INACTIVE') {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Account is ${user.status}. Please contact administrator.`
        );
    }

    // Generate new accessToken (keep refreshToken unchanged)
    const userInfo = {
        _id: user._id,
        role: user.role,
        walletAddress: decodedToken.walletAddress, // Preserve wallet from original token
    };

    const newAccessToken = await JwtProvider.generateToken(
        userInfo,
        env.ACCESS_TOKEN_SECRET_SIGNATURE,
        env.ACCESS_TOKEN_LIFE,
    );

    // Create audit log for token refresh
    await auditLogModel.createLog({
        userId: user._id,
        action: 'REFRESH_TOKEN',
        entityType: 'AUTH',
        entityId: user._id,
        details: {
            newTokenIssuedAt: new Date(),
        },
    });

    return {
        accessToken: newAccessToken,
        status: user.status,
        expiresIn: env.ACCESS_TOKEN_LIFE,
    };
};

export const authService = {
    loginByNationId,
    createWalletNonce,
    verifyWalletLogin,
    refreshAccessToken,
};
