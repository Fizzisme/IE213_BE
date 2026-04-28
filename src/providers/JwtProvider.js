import JWT from 'jsonwebtoken';

/**
 * Tạo JWT token
 * @param {Object} userInfo - Thông tin user (payload)
 * @param {string} secretSignature - Secret key dùng để ký token
 * @param {string|number} tokenLife - Thời gian sống của token (vd: '9h', '1d')
 * @returns {string} token
 */
const generateToken = async (userInfo, secretSignature, tokenLife) => {
    try {
        return JWT.sign(userInfo, secretSignature, {
            algorithm: 'HS256',   // Thuật toán ký (HMAC SHA256)
            expiresIn: tokenLife, // Thời gian hết hạn token
        });
    } catch (error) {
        // Ném lỗi ra ngoài để tầng trên xử lý
        throw error;
    }
};

/**
 * Xác thực JWT token
 * @param {string} token - Token cần verify
 * @param {string} secretSignature - Secret key đã dùng để ký
 * @returns {Object} payload đã giải mã nếu hợp lệ
 */
const verifyToken = async (token, secretSignature) => {
    try {
        return JWT.verify(token, secretSignature);
    } catch (error) {
        // Các lỗi thường gặp:
        // - TokenExpiredError: token hết hạn
        // - JsonWebTokenError: token không hợp lệ
        throw error;
    }
};

/**
 * Export các hàm liên quan JWT
 */
export const JwtProvider = {
    generateToken,
    verifyToken,
};