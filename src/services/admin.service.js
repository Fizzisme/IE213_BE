import { userModel } from '~/models/user.model';
import { auditLogModel } from '~/models/auditLog.model';
import { StatusCodes } from 'http-status-codes';
import { patientModel } from '~/models/patient.model';
import { doctorModel } from '~/models/doctorModel';
import ApiError from '~/utils/ApiError';
// lấy ra toàn bộ user tồn tại
const getUsers = async ({ status, page, limit, deleted }) => {
    if (deleted) {
        return await userModel.findDeleted({ page, limit });
    }
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
        throw new ApiError(StatusCodes.CONFLICT, `Không thể duyệt user ở trạng thái ${user.status}`);
    }

    // Cập nhật status → ACTIVE
    await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId,
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin approved user ${targetUserId}` },
    });

    return 'Người dùng được duyệt thành công';
};

// Từ chối user → REJECTED
const rejectUser = async ({ targetUserId, adminId, reason }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');
    console.log(user);
    // Chỉ từ chối được user đang PENDING
    if (user.status !== userModel.USER_STATUS.PENDING) {
        throw new ApiError(StatusCodes.CONFLICT, `Không thể từ chối user ở trạng thái ${user.status}`);
    }

    // Cập nhật status → REJECTED
    await userModel.updateById(targetUserId, {
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

    return 'Người dùng bị từ chối';
};

// Phục hồi user REJECTED → PENDING (cho phép xét duyệt lại)
const reReviewUser = async ({ targetUserId, adminId }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    if (user.status !== userModel.USER_STATUS.REJECTED) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            `Chỉ có thể phục hồi user ở trạng thái REJECTED, hiện tại: ${user.status}`,
        );
    }

    await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.PENDING,
    });

    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin re-reviewed user ${targetUserId} (REJECTED → PENDING)` },
    });

    return 'User đã được chuyển về trạng thái chờ duyệt';
};

// Thêm hàm softDeleteUser để admin có thể softdelete 1 user trong hệ thống
const softDeleteUser = async ({ targetUserId, adminId }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');
    if (user._destroy) throw new ApiError(StatusCodes.CONFLICT, 'User đã bị xóa trước đó');

    await userModel.softDelete(targetUserId);

    switch (user.role) {
        case userModel.USER_ROLES.PATIENT: {
            await patientModel.softDeleteByUserId(targetUserId);
            break;
        }
        case userModel.USER_ROLES.DOCTOR: {
            await doctorModel.softDeleteByUserId(targetUserId);
            break;
        }
    }

    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin soft-deleted user ${targetUserId} (role: ${user.role})` },
    });

    return `User ${targetUserId} đã bị xóa`;
};

export const adminService = {
    getUsers,
    getUserDetail,
    approveUser,
    rejectUser,
    reReviewUser,
    softDeleteUser,
};
