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
        // KHi user đăng kí tài khoản mặc định role là PATIENT
        role: userModel.USER_ROLES.PATIENT,
        authProviders: [
            payload.phoneNumber && {
                type: 'LOCAL',
                phoneHash: bcrypt.hashSync(payload.phoneNumber, 8),
                passwordHash: bcrypt.hashSync(payload.password, 8),
            },
        ].filter(Boolean),
        nationId: payload.nationId,
    });

    // Tạo patient sau khi tạo thành công người dùng
    const patient = await patientModel.createNew({
        userId: user._id,
        fullName: payload.fullName,
        gender: payload.gender,
        birthYear: payload.dob,
        phoneEncrypted: bcrypt.hashSync(payload.phoneNumber, 8),
        emailEncrypted: bcrypt.hashSync(payload.email, 8),
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: user._id,
        action: 'REGISTER_PATIENT',
        entityType: 'PATIENT',
        entityId: patient._id,
    });

    return {
        userId: user._id,
        patientId: patient._id,
        status: user.status,
        message: 'Đăng ký thành công. Tài khoản đang chờ admin duyệt.',
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
    if (!nonce) throw new ApiError(StatusCodes.NOT_FOUND, 'Nonce expired');

    const recovered = ethers.verifyMessage(nonce, signature);

    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Invalid signature');
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
    };
};

// Hàm đăng nhập bằng cccd/cmnd
const loginByNationId = async (data) => {
    const { nationId, password } = data;

    // Tìm người dùng trong DB
    const userExisted = await userModel.findByNationId(nationId);
    // Generic message để tránh lộ thông tin account
    if (!userExisted) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');

    // Ko cho phép admin đăng nhập vào role của người bình thường
    if (userExisted.role === userModel.USER_ROLES.ADMIN) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản ADMIN vui lòng đăng nhập tại /v1/admin/auth/login');
    }

    if (userExisted._destroy) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị vô hiệu hóa');
    }

    // Tìm phương thức đăng nhập local
    const localProvider = userExisted?.authProviders.find((p) => p.type === 'LOCAL');
    
    if (!localProvider) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');
    // Kiểm tra tính hợp lệ của password
    if (!bcrypt.compareSync(password, localProvider.passwordHash)) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');
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
    };
};

export const authService = {
    register,
    loginByNationId,
    createWalletNonce,
    verifyWalletLogin,
};
