
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { env } from '~/config/environment';
import { JwtProvider } from '~/providers/JwtProvider';

const isAuthorized = async (req, res, next) => {
    try {
        // 1. Lấy token từ Cookie
        // Lưu ý: 'accessToken' phải trùng với tên bạn đặt khi res.cookie('accessToken', token)
        const token = req.cookies?.accessToken;

        if (!token) {
            throw new ApiError(
                StatusCodes.UNAUTHORIZED,
                'Bạn cần đăng nhập để thực hiện tính năng này (Token not found)',
            );
        }

        // 2. Verify token
        // Lưu ý: Token trong cookie thường chỉ là chuỗi token sạch, không có chữ "Bearer "
        // nên không cần dùng split(' ')[1] như header.
        const decodedUser = await JwtProvider.verifyToken(token, env.ACCESS_TOKEN_SECRET_SIGNATURE);

        // 3. Lưu thông tin user vào req
        req.user = decodedUser;

        // 4. Cho đi tiếp
        next();
    } catch (error) {
        // Xử lý lỗi token
        if (error.name === 'TokenExpiredError') {
            next(new ApiError(StatusCodes.UNAUTHORIZED, 'Token đã hết hạn - Hãy đăng nhập lại'));
        } else if (error.name === 'JsonWebTokenError') {
            next(new ApiError(StatusCodes.UNAUTHORIZED, 'Token không hợp lệ'));
        } else {
            next(error);
        }
    }
};

export const authMiddleware = {
    isAuthorized,
};
