// src/middlewares/verifyToken.js
import { StatusCodes } from 'http-status-codes';
import { env } from '~/config/environment';
import { JwtProvider } from '~/providers/JwtProvider';
import ApiError from '~/utils/ApiError';

// Middleware xác thực token từ cookie hoặc header Authorization
export const verifyToken = async (req, res, next) => {
    try {
        // Lấy accessToken từ cookie hoặc Bearer header
        const accessToken =
            req.cookies?.accessToken ||
            req.headers.authorization?.replace('Bearer ', '');

        if (!accessToken) {
            throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized: Token not found');
        }

        // ✅ [MEDIUM FIX #4] Verify token và gán vào req.user (standardized JWT extraction)
        const decoded = await JwtProvider.verifyToken(
            accessToken,
            env.ACCESS_TOKEN_SECRET_SIGNATURE,
        );

        // Gán req.user để tất cả các middleware và controller sử dụng được (single source of truth)
        req.user = decoded;

        next();
    } catch (err) {
        // Nếu token hết hạn hoặc không hợp lệ
        if (err.statusCode) return next(err);
        next(new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized: Invalid token'));
    }
};