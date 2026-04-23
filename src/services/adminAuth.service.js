import bcrypt from 'bcrypt';
import { StatusCodes } from 'http-status-codes';
import { env } from '~/config/environment';
import { userModel } from '~/models/user.model';
import { adminModel } from '~/models/admin.model';
import { JwtProvider } from '~/providers/JwtProvider';
import ApiError from '~/utils/ApiError';

// Hàm lấy accessToken và refreshToken trả về từ JWTProvider
const issueTokens = async (user) => {
    const walletAddress = user.authProviders?.find((p) => p.walletAddress)?.walletAddress || null;
    const payload = {
        _id: user._id,
        role: user.role,
        walletAddress,
    };

    const accessToken = await JwtProvider.generateToken(
        payload,
        env.ACCESS_TOKEN_SECRET_SIGNATURE,
        env.ACCESS_TOKEN_LIFE,
    );

    const refreshToken = await JwtProvider.generateToken(
        payload,
        env.REFRESH_TOKEN_SECRET_SIGNATURE,
        env.REFRESH_TOKEN_LIFE,
    );

    return { accessToken, refreshToken };
};

// Hàm login cho user
const login = async ({ nationId, password }) => {
    const user = await userModel.findByNationId(nationId);
    // Generic message để tránh lộ thông tin account
    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Thông tin đăng nhập không hợp lệ');
    }

    const localProvider = user.authProviders?.find((p) => p.type === 'LOCAL');
    if (!localProvider) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Thông tin đăng nhập không hợp lệ');
    }
    // Kiểm tra mật khẩu có hợp lý hay chưa
    const isPasswordValid = bcrypt.compareSync(password, localProvider.passwordHash);
    if (!isPasswordValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thông tin đăng nhập không hợp lệ');
    }
    // Kiểm tra role đăng nhập
    if (user.role !== userModel.USER_ROLES.ADMIN) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Không có quyền truy cập khu vực admin');
    }
    // Kiểm tra user có hoạt động ko
    if (user._destroy || user.status !== userModel.USER_STATUS.ACTIVE) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản admin không ở trạng thái hoạt động');
    }
    // Kiểm tra những Admin ko tồn tại trong hệ thống
    const adminProfile = await adminModel.getAdminByUserId(user._id);
    if (!adminProfile) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Không tìm thấy hồ sơ admin');
    }
    // Kiểm tra admin đã bị vô hiệu hóa
    if (adminProfile.deletedAt || adminProfile.status !== 'ACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Hồ sơ admin đã bị vô hiệu hóa');
    }
    // Update thời điểm lần cuối đăng nhập
    await adminModel.updateAdmin(adminProfile._id, {
        lastLoginAt: new Date(),
    });

    return issueTokens(user);
};

export const adminAuthService = {
    login,
};
