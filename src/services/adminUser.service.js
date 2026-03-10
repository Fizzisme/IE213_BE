import { userModel } from '~/models/user.model';
import { auditLogModel } from '~/models/auditLog.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';

const getUsers = async ({ status, page, limit }) => {
    return await userModel.findByStatus({ status, page, limit });
};

// Xem chi tiết 1 user
const getUserDetail = async (userId) => {
    const user = await userModel.findDetailById(userId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');
    return user;
};

export const adminUserService = {
    getUsers,
    getUserDetail,
};