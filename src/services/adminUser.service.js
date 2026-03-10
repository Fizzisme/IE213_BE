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

// Duyệt user → ACTIVE
const approveUser = async ({ targetUserId, adminId }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    // Chỉ duyệt được user đang PENDING
    if (user.status !== userModel.USER_STATUS.PENDING) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            `Không thể duyệt user ở trạng thái ${user.status}`,
        );
    }

    // Cập nhật status → ACTIVE
    const updatedUser = await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.ACTIVE,
        isActive: true,
        approvedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: null,
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin approved user ${targetUserId}` },
    });

    return { message: 'User approved successfully', user: updatedUser };
};

// Từ chối user → REJECTED
const rejectUser = async ({ targetUserId, adminId, reason }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    // Chỉ từ chối được user đang PENDING
    if (user.status !== userModel.USER_STATUS.PENDING) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            `Không thể từ chối user ở trạng thái ${user.status}`,
        );
    }

    // Cập nhật status → REJECTED
    const updatedUser = await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.REJECTED,
        rejectionReason: reason,
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin rejected user ${targetUserId}. Reason: ${reason}` },
    });

    return { message: 'User rejected', user: updatedUser };
};


export const adminUserService = {
    getUsers,
    getUserDetail,
    approveUser,
    rejectUser,
};