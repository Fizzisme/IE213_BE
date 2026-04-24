import { userModel } from '~/models/user.model';
import { auditLogModel } from '~/models/auditLog.model';
import { StatusCodes } from 'http-status-codes';
import { patientModel } from '~/models/patient.model';
import { doctorModel } from '~/models/doctor.model';
import { labTechModel } from '~/models/labTech.model';
import ApiError from '~/utils/ApiError';
import { ethers } from 'ethers';
import { metaMaskTxBuilder, verifyTransactionOnBlockchain } from '~/utils/metaMaskTxBuilder';
import { blockchainContracts } from '~/blockchain/contract';
import { adminModel } from '~/models/admin.model';
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

// Duyệt user → ACTIVE (Prepare)
const prepareApproveUser = async ({ targetUserId, adminId }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    // Chỉ duyệt được user đang PENDING
    if (user.status !== userModel.USER_STATUS.PENDING) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            `Không thể duyệt user ở trạng thái ${user.status}`,
        );
    }

    const patientWallet = user.authProviders?.find(p => p.walletAddress)?.walletAddress;
    if (!patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'User không có địa chỉ ví để đăng ký on-chain');
    }

    // Lấy ví admin
    const admin = await adminModel.AdminModel.findOne({ userId: adminId });
    if (!admin || !admin.walletAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Admin chưa cấu hình địa chỉ ví');
    }

    // Chuẩn bị transaction addPatient
    const txData = await metaMaskTxBuilder.prepareAddPatientTx(admin.walletAddress, patientWallet);

    return {
        message: 'Transaction prepared',
        targetUserId,
        patientWallet,
        ...txData
    };
};

// Duyệt user → ACTIVE (Confirm)
const confirmApproveUser = async ({ targetUserId, adminId, txHash }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    if (user.status !== userModel.USER_STATUS.PENDING) {
        throw new ApiError(StatusCodes.CONFLICT, 'User không ở trạng thái PENDING');
    }

    const patientWallet = user.authProviders?.find(p => p.walletAddress)?.walletAddress;

    // 1. Verify transaction on blockchain
    const receipt = await verifyTransactionOnBlockchain(txHash);
    if (!receipt.confirmed || receipt.status !== 'SUCCESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch chưa thành công hoặc thất bại trên blockchain');
    }

    // 2. Verify function call (addPatient)
    const accountManager = blockchainContracts.read.accountManager;
    const tx = await accountManager.interface.parseTransaction({
        data: (await blockchainContracts.read.accountManager.provider.getTransaction(txHash)).data
    });

    if (tx.name !== 'addPatient' || tx.args[0].toLowerCase() !== patientWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Nội dung giao dịch không khớp với yêu cầu duyệt patient');
    }

    // 3. Cập nhật MongoDB
    const updatedUser = await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.ACTIVE,
        isActive: true,
        approvedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: null,
        blockchainAccount: {
            status: 'ACTIVE',
            txHash: txHash
        }
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin approved user ${targetUserId} via blockchain tx ${txHash}` },
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

    const updatedUser = await userModel.updateById(targetUserId, {
        status: userModel.USER_STATUS.PENDING,
        rejectionReason: null,
        approvedAt: null,
        approvedBy: null,
    });

    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin re-reviewed user ${targetUserId} (REJECTED → PENDING)` },
    });

    return { message: 'User đã được chuyển về trạng thái chờ duyệt', user: updatedUser };
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
        case userModel.USER_ROLES.LAB_TECH: {
            await labTechModel.LabTechModel.findOneAndUpdate(
                { userId: targetUserId, _destroy: false },
                { _destroy: true },
                { new: true }
            );
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

    return { message: `User ${targetUserId} đã bị xóa`, role: user.role };
};

export const adminUserService = {
    getUsers,
    getUserDetail,
    prepareApproveUser,
    confirmApproveUser,
    rejectUser,
    reReviewUser,
    softDeleteUser,
};
