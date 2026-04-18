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
// Hàm đăng ký local
const register = async (payload) => {
    // ✅ VALIDATION: Require walletAddress for patient registration
    if (!payload.walletAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST,
            'Wallet address is required for patient registration. Please provide a valid Ethereum wallet address.');
    }

    // ✅ VALIDATION: Validate wallet address format
    if (!ethers.isAddress(payload.walletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST,
            'Invalid wallet address format. Expected 0x prefixed 40-character hex string.');
    }

    // ✅ VALIDATION: Prevent zero address
    if (payload.walletAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        throw new ApiError(StatusCodes.BAD_REQUEST,
            'Cannot use zero address as wallet. Please provide a valid wallet address.');
    }

    // Tìm người dùng trong DB
    const userExisted = await userModel.findByNationId(payload.nationId);
    // Nếu người dùng tồn tại thì ném ra lỗi
    if (userExisted) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Người dùng đã tồn tại');

    // ✅ VALIDATION: Check if wallet already registered
    const walletUser = await userModel.findByWalletAddress(payload.walletAddress);
    if (walletUser) {
        throw new ApiError(StatusCodes.CONFLICT,
            'Wallet address is already registered. Please use a different wallet or contact support.');
    }

    // Tạo người dùng
    const user = await userModel.createNew({
        authProviders: [
            payload.nationId && {
                type: 'LOCAL',
                nationId: payload.nationId,
                email: payload.email,
                passwordHash: bcrypt.hashSync(payload.password, 8),
                walletAddress: payload.walletAddress, // ✅ Include wallet address
            },
        ].filter(Boolean),
        blockchainAccount: {
            status: 'PENDING', // ✅ Set initial blockchain status
            registeredAt: new Date(),
        },
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: user._id,
        action: 'REGISTER_USER',
        entityType: 'USER',
        entityId: user._id,
        details: {
            walletAddress: payload.walletAddress,
            note: 'User registered with wallet address',
        },
    });

    return {
        userId: user._id,
        walletAddress: payload.walletAddress,
        blockchainStatus: 'PENDING', // ✅ Tell client they need admin approval
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
    if (!user) {
        user = await userModel.createNew({
            authProviders: [
                walletAddress && {
                    type: 'WALLET',
                    walletAddress,
                },
            ].filter(Boolean),
        });

        // Gọi registerPatient() on-chain để đăng ký role PATIENT trên blockchain
        try {
            const tx = await blockchainContracts.admin.accountManager.registerPatient();
            await tx.wait();
        } catch (blockchainError) {
            // Nếu gọi blockchain thất bại, vẫn cho phép đăng ký off-chain
            // nhưng ghi log cảnh báo
            console.error('Blockchain registerPatient failed:', blockchainError.message);
        }
    }

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

    // ✅ Thêm walletAddress vào JWT (Cách 2: Hybrid approach)
    // walletAddress là parameter của function - không cần khai báo lại
    // Tạo ra thông tin người dùng để mã hóa vào token
    const userInfo = {
        _id: user._id,
        role: user.role,
        walletAddress: walletAddress,  // ← Dùng parameter trực tiếp
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

    if (user.status !== userModel.USER_STATUS.ACTIVE) {
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
    register,
    loginByNationId,
    createWalletNonce,
    verifyWalletLogin,
    refreshAccessToken,
};
