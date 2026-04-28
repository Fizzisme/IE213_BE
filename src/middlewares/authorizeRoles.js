// Middleware kiểm tra quyền truy cập theo role

/**
 * Hàm middleware kiểm tra role của user
 * @param  {...string} roles - Danh sách các role được phép truy cập
 * Ví dụ: authorizeRoles('admin', 'doctor')
 */
export const authorizeRoles = (...roles) => {
    // Trả về middleware function
    return (req, res, next) => {

        // Kiểm tra role của user hiện tại có nằm trong danh sách cho phép hay không
        // req.user được gán từ middleware xác thực trước đó (auth middleware)
        if (!roles.includes(req.user.role)) {
            // Nếu không có quyền thì trả về 403 Forbidden
            return res.status(403).json({ message: 'Không có quyền truy cập' });
        }

        // Nếu hợp lệ thì cho phép đi tiếp
        next();
    };
};