import { userModel } from '~/models/user.model';
import { auditLogModel } from '~/models/auditLog.model';
import { StatusCodes } from 'http-status-codes';
import { patientModel } from '~/models/patient.model';
import { doctorModel } from '~/models/doctor.model';
import ApiError from '~/utils/ApiError';
import { blockchainProvider } from '~/blockchains/provider';
import { blockchainAbis, identityManagerContract } from '~/blockchains/contract';
import { validateContractTransaction } from '~/utils/blockchainVerification';

const BLOCKCHAIN_ROLE_ENUM = {
    PATIENT: '1',
    DOCTOR: '2',
    LAB_TECH: '3',
    ADMIN: '4',
};

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

    // Cập nhật status MongoDB (Tạm thờ i chờ sync blockchain nếu là Doctor/LabTech)
    await userModel.updateById(targetUserId, {
        approvedAt: new Date(),
        approvedBy: adminId,
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_APPROVE_INIT',
        entityType: 'USER',
        entityId: targetUserId,
        details: { note: `Admin started approval for user ${targetUserId}` },
    });

    let message = 'Duyệt thành công (Local)';
    let needsBlockchain = false;

    // Nếu là Doctor hoặc Lab Tech thì cần đăng ký lên Smart Contract
    if (user.role === userModel.USER_ROLES.DOCTOR || user.role === userModel.USER_ROLES.LAB_TECH) {
        needsBlockchain = true;
        message = 'Vui lòng xác nhận đăng ký vai trò trên MetaMask';
    } else if (user.role === userModel.USER_ROLES.PATIENT) {
        // Patient có thể đã có registrationSignature (Gasless)
        if (user.registrationSignature) {
            needsBlockchain = true;
            message = 'Bệnh nhân đăng ký Gasless, vui lòng nộp chữ ký lên Blockchain qua MetaMask';
        } else {
            // Nếu không có signature thì duyệt ACTIVE luôn (truyền thống)
            await userModel.updateById(targetUserId, { status: userModel.USER_STATUS.ACTIVE });
        }
    }

    // Lấy wallet address từ authProviders
    const walletProvider = user.authProviders.find(p => p.type === 'WALLET');
    const blockchain = needsBlockchain && walletProvider?.walletAddress ? {
        contractAddress: identityManagerContract.target,
        method: user.role === userModel.USER_ROLES.PATIENT ? 'registerPatientGasless' : 'registerStaff',
        args: user.role === userModel.USER_ROLES.PATIENT
            ? [walletProvider.walletAddress, user.registrationSignature]
            : [walletProvider.walletAddress, BLOCKCHAIN_ROLE_ENUM[user.role]],
    } : null;

    return {
        message,
        needsBlockchain,
        role: user.role,
        targetWallet: walletProvider?.walletAddress,
        registrationSignature: user.registrationSignature,
        blockchain,
    };
};

// Từ chối user → REJECTED
const rejectUser = async ({ targetUserId, adminId, reason }) => {
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

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

    return 'Ngườ i dùng bị từ chối';
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

// Xác minh giao dịch Admin đã đăng ký Gasless cho Patient
const verifyOnboarding = async ({ targetUserId, txHash, adminId }) => {
    // 1. Lấy user mục tiêu và admin hiện tại để biết ai là đối tượng được đăng ký, ai là người phải ký tx.
    const user = await userModel.findById(targetUserId);
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User không tồn tại');

    const adminUser = await userModel.findById(adminId);
    if (!adminUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Admin không tồn tại');

    // 2. Lấy ví admin và ví user mục tiêu để đối chiếu signer + calldata của transaction.
    const adminWallet = adminUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!adminWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Admin chưa liên kết ví Blockchain');
    }

    const targetWallet = user.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!targetWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'User mục tiêu chưa liên kết ví Blockchain');
    }

    // 3. Dựa vào role để quyết định tx này phải là registerStaff hay registerPatientGasless.
    const tx = await blockchainProvider.getTransaction(txHash);
    const isStaffRegistration = [userModel.USER_ROLES.DOCTOR, userModel.USER_ROLES.LAB_TECH].includes(user.role);

    validateContractTransaction({
        tx,
        abi: blockchainAbis.IdentityManager,
        expectedContract: identityManagerContract.target,
        expectedMethod: isStaffRegistration ? 'registerStaff' : 'registerPatientGasless',
        expectedArgs: isStaffRegistration
            ? [targetWallet, BLOCKCHAIN_ROLE_ENUM[user.role]]
            : [targetWallet, user.registrationSignature],
    });

    // 4. Giao dịch hợp lệ vẫn phải do chính ví admin hiện tại ký.
    if (tx.from.toLowerCase() !== adminWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch blockchain không được ký bởi ví admin hiện tại');
    }

    // Đợi Receipt từ Blockchain
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        // Cập nhật trạng thái đồng bộ và duyệt ACTIVE
        await userModel.updateById(targetUserId, {
            status: userModel.USER_STATUS.ACTIVE,
            approvedAt: new Date(),
            approvedBy: adminId,
            blockchainMetadata: {
                isSynced: true,
                txHash: txHash
            }
        });

        // Ghi audit log
        await auditLogModel.createLog({
            userId: adminId,
            action: isStaffRegistration ? 'VERIFY_STAFF_REGISTRATION' : 'VERIFY_ONBOARDING',
            entityType: 'USER',
            entityId: targetUserId,
            details: {
                txHash,
                role: user.role,
                note: isStaffRegistration
                    ? `Admin verified blockchain role registration for ${user.role} ${targetUserId}`
                    : `Admin verified gasless onboarding for patient ${targetUserId}`,
            },
        });

        return {
            message: 'Duyệt tài khoản và đồng bộ Blockchain thành công',
            role: user.role,
        };
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch trên Blockchain thất bại');
    }
};

export const adminService = {
    getUsers,
    getUserDetail,
    approveUser,
    rejectUser,
    reReviewUser,
    softDeleteUser,
    verifyOnboarding,
};
