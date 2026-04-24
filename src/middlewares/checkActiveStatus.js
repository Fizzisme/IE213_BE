import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { userModel } from '~/models/user.model';

/**
 * Middleware để kiểm tra trạng thái ACTIVE của user.
 * Hầu hết các tính năng nghiệp vụ (tạo record, cấp quyền...) đều yêu cầu ACTIVE.
 * User PENDING vẫn có thể login để xem status nhưng không thể thao tác y tế.
 */
export const checkActiveStatus = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await userModel.findById(userId);

        if (!user) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng không tồn tại');
        }

        if (user.status !== 'ACTIVE') {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Tài khoản của bạn đang ở trạng thái ${user.status}. Vui lòng chờ Admin phê duyệt để thực hiện tính năng này.`
            );
        }

        next();
    } catch (error) {
        next(error);
    }
};
