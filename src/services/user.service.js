// services/userService.js
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { userModel } from '~/models/user.model';

const getMe = async (userId) => {
    // Truy vấn vào DB để lấy dữ liệu mới nhất (đặc biệt là trường hasProfile)
    const user = await userModel.findById(userId); // Bỏ password cho bảo mật

    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng không tồn tại');
    }

    return user;
};

export const userService = {
    getMe,
};
