import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { provider } from '~/blockchain/provider';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
import {
    prepareGrantAccessTx,
    prepareRevokeAccessTx,
    prepareUpdateAccessTx,
    verifyAndBroadcastSignedTx,
    verifyTransactionOnBlockchain,
} from '~/utils/metaMaskTxBuilder';
// import { notificationService } from '~/services/notification.service'; // REMOVED - not essential

/**
 * Service quản lý quyền truy cập dữ liệu y tế (Patient-centric)
 * - Bệnh nhân cấp quyền cho bác sĩ/lab tech
 * - Bệnh nhân cập nhật/thu hồi quyền
 * - Kiểm tra quyền truy cập
 */

// Bệnh nhân cấp quyền truy cập cho bác sĩ hoặc lab tech
const grantAccess = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    // Tính năng 3: Hỗ trợ expiresAt (Unix timestamp) làm thái thay thế cho durationHours
    let finalDurationHours = durationHours || 0;
    if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt <= now) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'expiresAt phải lớn hơn thời gian hiện tại');
        }
        finalDurationHours = Math.ceil((expiresAt - now) / 3600);
    }

    // level: FULL hoặc SENSITIVE
    const accessLevel = level === 'SENSITIVE' ? 3 : 2; // SENSITIVE:3, FULL:2

    try {
        // Sử dụng ví bệnh nhân thay vì ví admin
        // Smart contract yêu cầu msg.sender phải là bệnh nhân
        if (!blockchainContracts.patient.accessControl) {
            throw new ApiError(StatusCodes.BAD_REQUEST,
                'Ví bệnh nhân test chưa được cấu hình. Thêm TEST_PATIENT_PRIVATE_KEY vào .env.local');
        }

        // TỰ ĐỘNG THU HỒI: Kiểm tra xem quyền đã tồn tại chưa
        try {
            console.log(`Kiểm tra quyền hiện tại: patient=${currentUser.walletAddress}, accessor=${accessorAddress}`);
            const existingGrant = await blockchainContracts.read.accessControl.getAccessGrant(
                currentUser.walletAddress,
                accessorAddress
            );

            if (existingGrant.isActive) {
                console.log('Tìm thấy quyền hiện tại, tự động thu hồi trước khi cấp quyền mới...');
                const revokeX = await blockchainContracts.patient.accessControl.revokeAccess(accessorAddress);
                const revokeReceipt = await revokeX.wait();
                if (!revokeReceipt || revokeReceipt.status !== 1) {
                    throw new Error('Giao dịch thu hồi thất bại');
                }
                console.log('Thu hồi tự động thành công:', revokeReceipt.hash);

                // Chờ một chút trước khi cấp quyền mới để tránh race conditions
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (checkErr) {
            // Nếu quyền không tồn tại hoặc lỗi khác, tiếp tục cấp quyền
            if (!checkErr.message?.includes('Grant not found')) {
                console.warn('Cảnh báo kiểm tra quyền hiện tại:', checkErr.message);
            }
        }

        // Tiếp tục cấp quyền mới
        const tx = await blockchainContracts.patient.accessControl.grantAccess(
            accessorAddress,
            accessLevel,
            finalDurationHours
        );
        const receipt = await tx.wait();

        // Ghi audit log
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'GRANT_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: receipt.hash,
            status: 'SUCCESS',
            details: {
                note: `Patient granted ${level} access to ${accessorAddress} for ${finalDurationHours || 'unlimited'} hours`,
                accessorAddress,
                level,
                durationHours: finalDurationHours,
                expiresAt: expiresAt || 0,
            },
        });

        // Tính năng 4: Gửi thông báo cho bác sĩ/accessor (BỎ QUA - không cần thiết cho flow)
        const expiresAtTimestamp = expiresAt || (finalDurationHours > 0 ? Math.floor(Date.now() / 1000) + (finalDurationHours * 3600) : 0);
        // Notification removed - focus on core workflow instead
        // await notificationService.sendAccessGrantedNotification(currentUser, accessorAddress, level, expiresAtTimestamp);

        return {
            message: 'Cấp quyền truy cập thành công',
            txHash: receipt.hash,
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Cấp quyền thất bại: ${error.message}`);
    }
};

// Bệnh nhân cập nhật quyền truy cập
const updateAccess = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    // Tính năng 3: Hỗ trợ expiresAt (Unix timestamp) làm thái thay thế cho durationHours
    let finalDurationHours = durationHours || 0;
    if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt <= now) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'expiresAt phải lớn hơn thời gian hiện tại');
        }
        finalDurationHours = Math.ceil((expiresAt - now) / 3600);
    }

    const accessLevel = level === 'SENSITIVE' ? 3 : 2;

    try {
        // ⭐ FIX: Use patient wallet instead of admin wallet
        if (!blockchainContracts.patient.accessControl) {
            throw new ApiError(StatusCodes.BAD_REQUEST,
                'Test patient wallet not configured. Add TEST_PATIENT_PRIVATE_KEY to .env.local');
        }

        // ✅ CHECK first: Verify access exists before updating
        try {
            console.log(`📋 Checking existing access before update: patient=${currentUser.walletAddress}, accessor=${accessorAddress}`);
            const existingGrant = await blockchainContracts.read.accessControl.getAccessGrant(
                currentUser.walletAddress,
                accessorAddress
            );

            if (!existingGrant.isActive) {
                throw new ApiError(StatusCodes.NOT_FOUND, 'Access grant not found or already revoked');
            }
        } catch (checkErr) {
            if (checkErr instanceof ApiError) throw checkErr;
            throw new ApiError(StatusCodes.BAD_REQUEST, `Cannot verify existing access: ${checkErr.message}`);
        }

        // ✅ NOW update access with validated level
        const tx = await blockchainContracts.patient.accessControl.updateAccess(
            accessorAddress,
            accessLevel,
            finalDurationHours
        );
        const receipt = await tx.wait();

        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'UPDATE_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: receipt.hash,
            status: 'SUCCESS',
            details: {
                note: `Patient updated access for ${accessorAddress} to ${level}`,
                accessorAddress,
                level,
                durationHours: finalDurationHours,
                expiresAt: expiresAt || 0,
            },
        });

        // Tính năng 4: Gửi thông báo cho bác sĩ/accessor (Bỏ QUA - không cần thiết cho flow)
        const expiresAtTimestamp = expiresAt || (finalDurationHours > 0 ? Math.floor(Date.now() / 1000) + (finalDurationHours * 3600) : 0);
        // Thông báo bỏ đi - tập trung vào workflow cốt lõi
        // await notificationService.sendAccessUpdatedNotification(currentUser, accessorAddress, level, expiresAtTimestamp);

        return {
            message: 'Cập nhật quyền truy cập thành công',
            txHash: receipt.hash,
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Cập nhật quyền thất bại: ${error.message}`);
    }
};

// Bệnh nhân thu hồi quyền truy cập
const revokeAccess = async (currentUser, data) => {
    const { accessorAddress } = data;

    if (!accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress');
    }

    try {
        // ⭐ FIX: Use patient wallet instead of admin wallet
        if (!blockchainContracts.patient.accessControl) {
            throw new ApiError(StatusCodes.BAD_REQUEST,
                'Test patient wallet not configured. Add TEST_PATIENT_PRIVATE_KEY to .env.local');
        }

        const tx = await blockchainContracts.patient.accessControl.revokeAccess(accessorAddress);
        const receipt = await tx.wait();

        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'REVOKE_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: receipt.hash,
            status: 'SUCCESS',
            details: {
                note: `Patient revoked access from ${accessorAddress}`,
                accessorAddress,
            },
        });

        // Tính năng 4: Gửi thông báo cho bác sĩ/accessor (BỎ QUA - không cần thiết cho flow)
        // Thông báo bỏ đi - tập trung vào workflow cốt lõi
        // await notificationService.sendAccessRevokedNotification(currentUser, accessorAddress);

        return {
            message: 'Thu hồi quyền truy cập thành công',
            txHash: receipt.hash,
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Thu hồi quyền thất bại: ${error.message}`);
    }
};

// Kiểm tra quyền truy cập
const checkAccess = async (currentUser, data) => {
    const { patientAddress, accessorAddress, requiredLevel } = data;

    if (!patientAddress || !accessorAddress || !requiredLevel) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc');
    }

    const accessLevel = requiredLevel === 'SENSITIVE' ? 3 : requiredLevel === 'FULL' ? 2 : requiredLevel === 'EMERGENCY' ? 1 : 0;

    try {
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientAddress,
            accessorAddress,
            accessLevel
        );

        return { hasAccess };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Kiểm tra quyền thất bại: ${error.message}`);
    }
};

// Lấy thông tin quyền truy cập
const getAccessGrant = async (currentUser, data) => {
    const { patientAddress, accessorAddress } = data;

    if (!patientAddress || !accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc');
    }

    try {
        const grant = await blockchainContracts.read.accessControl.getAccessGrant(
            patientAddress,
            accessorAddress
        );

        return {
            level: Number(grant.level),
            grantedAt: Number(grant.grantedAt),
            expiresAt: Number(grant.expiresAt),
            isActive: grant.isActive,
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lấy thông tin quyền thất bại: ${error.message}`);
    }
};

// Lấy danh sách tất cả grant của bệnh nhân (query từ blockchain events)
const getPatientGrants = async (currentUser, page = 1, limit = 50) => {
    const patientAddress = currentUser.walletAddress;

    if (!patientAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Wallet address không hợp lệ');
    }

    try {
        // Lấy AccessGranted events cho bệnh nhân này (patient = msg.sender, indexed)
        const grantedEvents = await blockchainContracts.read.accessControl.queryFilter(
            blockchainContracts.read.accessControl.filters.AccessGranted(patientAddress),
            0,
            'latest'
        );

        // Lấy AccessRevoked events cho bệnh nhân này
        const revokedEvents = await blockchainContracts.read.accessControl.queryFilter(
            blockchainContracts.read.accessControl.filters.AccessRevoked(patientAddress),
            0,
            'latest'
        );

        // Build set những accessor bị revoke
        const revokedAccessors = new Set();
        revokedEvents.forEach(event => {
            revokedAccessors.add(event.args.accessor.toLowerCase());
        });

        // Build map: accessor => {level, grantedAt, expiresAt} (latest version của mỗi accessor)
        const grantMap = new Map();
        grantedEvents.forEach(event => {
            const accessor = event.args.accessor.toLowerCase();
            const level = Number(event.args.level);
            const expiresAt = Number(event.args.expiresAt);
            const timestamp = Number(event.args.timestamp);

            // Lấy version mới nhất của grant này (update sẽ tạo event mới)
            if (!grantMap.has(accessor) || timestamp > grantMap.get(accessor).grantedAt) {
                grantMap.set(accessor, {
                    accessor,
                    level,
                    levelName: level === 3 ? 'SENSITIVE' : level === 2 ? 'FULL' : 'UNKNOWN',
                    grantedAt: timestamp,
                    expiresAt,
                    isExpired: expiresAt > 0 && expiresAt < Math.floor(Date.now() / 1000),
                    isActive: !revokedAccessors.has(accessor),
                });
            }
        });

        // Filter: chỉ lấy grant đang "active" (not revoked + not expired)
        const activeGrants = Array.from(grantMap.values())
            .filter(g => g.isActive && !g.isExpired)
            .sort((a, b) => b.grantedAt - a.grantedAt);

        // Paginate
        const total = activeGrants.length;
        const skip = (page - 1) * limit;
        const paginatedGrants = activeGrants.slice(skip, skip + limit);

        return {
            code: StatusCodes.OK,
            message: 'Lấy danh sách quyền truy cập thành công',
            grants: paginatedGrants,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lấy danh sách quyền thất bại: ${error.message}`);
    }
};

// ==============================================================================
// METAMASK FLOW: PREPARE & CONFIRM FUNCTIONS
// ==============================================================================

/**
 * Chuẩn bị unsigned transaction cho GRANT ACCESS (Step 1)
 * Bệnh nhân lấy unsigned tx để ký với MetaMask
 */
const prepareGrantAccessTransaction = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    // Kiểm tra user status
    const user = await userModel.findById(currentUser._id);
    if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Account không hoạt động hoặc không tồn tại');
    }

    // Tính finalDurationHours tương tự grantAccess
    let finalDurationHours = durationHours || 0;
    if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt <= now) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'expiresAt phải lớn hơn thời gian hiện tại');
        }
        finalDurationHours = Math.ceil((expiresAt - now) / 3600);
    }

    try {
        const txData = await prepareGrantAccessTx(
            currentUser.walletAddress,
            accessorAddress,
            level,
            finalDurationHours
        );

        console.log(`[prepareGrantAccessTransaction] Unsigned tx chuẩn bị thành công cho accessor: ${accessorAddress}`);

        return {
            success: true,
            data: txData,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Xác nhận GRANT ACCESS sau khi frontend ký (Step 2)
 * Backend xác thực txHash, broadcast, và update MongoDB
 */
const confirmGrantAccess = async (currentUser, data) => {
    const { accessorAddress, txHash, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, txHash');
    }

    try {
        // Xác thực giao dịch trên blockchain
        console.log(`[confirmGrantAccess] Xác thực txHash: ${txHash}`);
        const txVerification = await verifyTransactionOnBlockchain(txHash);

        if (!txVerification.confirmed) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch chưa được xác thực trên blockchain');
        }

        // Xác thực signer match currentUser
        const normalizedSigner = txVerification.from?.toLowerCase();
        const normalizedPatient = currentUser.walletAddress.toLowerCase();

        if (normalizedSigner !== normalizedPatient) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Signer không match. Expected: ${normalizedPatient}, Got: ${normalizedSigner}`
            );
        }

        // Ghi audit log
        const finalDurationHours = durationHours || (expiresAt ? Math.ceil((expiresAt - Math.floor(Date.now() / 1000)) / 3600) : 0);

        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'GRANT_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: txHash,
            status: 'SUCCESS',
            details: {
                note: `Patient granted ${level} access to ${accessorAddress} via MetaMask`,
                accessorAddress,
                level,
                durationHours: finalDurationHours,
                expiresAt: expiresAt || 0,
            },
        });

        console.log(`[confirmGrantAccess] Grant access confirmed. TxHash: ${txHash}`);

        return {
            success: true,
            message: 'Cấp quyền truy cập thành công (MetaMask)',
            data: {
                accessorAddress,
                txHash,
                blockNumber: txVerification.blockNumber,
                level,
                durationHours: finalDurationHours,
                status: 'SUCCESS',
            },
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Xác nhận grant access thất bại: ${error.message}`);
    }
};

/**
 * Chuẩn bị unsigned transaction cho REVOKE ACCESS (Step 1)
 */
const prepareRevokeAccessTransaction = async (currentUser, data) => {
    const { accessorAddress } = data;

    if (!accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress');
    }

    // Kiểm tra user status
    const user = await userModel.findById(currentUser._id);
    if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Account không hoạt động hoặc không tồn tại');
    }

    try {
        const txData = await prepareRevokeAccessTx(currentUser.walletAddress, accessorAddress);

        console.log(`[prepareRevokeAccessTransaction] Unsigned tx chuẩn bị thành công cho accessor: ${accessorAddress}`);

        return {
            success: true,
            data: txData,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Xác nhận REVOKE ACCESS sau khi frontend ký (Step 2)
 */
const confirmRevokeAccess = async (currentUser, data) => {
    const { accessorAddress, txHash } = data;

    if (!accessorAddress || !txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, txHash');
    }

    try {
        // Xác thực giao dịch
        console.log(`[confirmRevokeAccess] Xác thực txHash: ${txHash}`);
        const txVerification = await verifyTransactionOnBlockchain(txHash);

        if (!txVerification.confirmed) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch chưa được xác thực trên blockchain');
        }

        // Xác thực signer
        const normalizedSigner = txVerification.from?.toLowerCase();
        const normalizedPatient = currentUser.walletAddress.toLowerCase();

        if (normalizedSigner !== normalizedPatient) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Signer không match. Expected: ${normalizedPatient}, Got: ${normalizedSigner}`
            );
        }

        // Ghi audit log
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'REVOKE_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: txHash,
            status: 'SUCCESS',
            details: {
                note: `Patient revoked access from ${accessorAddress} via MetaMask`,
                accessorAddress,
            },
        });

        console.log(`[confirmRevokeAccess] Revoke access confirmed. TxHash: ${txHash}`);

        return {
            success: true,
            message: 'Thu hồi quyền truy cập thành công (MetaMask)',
            data: {
                accessorAddress,
                txHash,
                blockNumber: txVerification.blockNumber,
                status: 'SUCCESS',
            },
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Xác nhận revoke access thất bại: ${error.message}`);
    }
};

/**
 * Chuẩn bị unsigned transaction cho UPDATE ACCESS (Step 1)
 */
const prepareUpdateAccessTransaction = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    // Kiểm tra user status
    const user = await userModel.findById(currentUser._id);
    if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Account không hoạt động hoặc không tồn tại');
    }

    // Tính finalDurationHours
    let finalDurationHours = durationHours || 0;
    if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt <= now) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'expiresAt phải lớn hơn thời gian hiện tại');
        }
        finalDurationHours = Math.ceil((expiresAt - now) / 3600);
    }

    try {
        const txData = await prepareUpdateAccessTx(
            currentUser.walletAddress,
            accessorAddress,
            level,
            finalDurationHours
        );

        console.log(`[prepareUpdateAccessTransaction] Unsigned tx chuẩn bị thành công cho accessor: ${accessorAddress}`);

        return {
            success: true,
            data: txData,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Xác nhận UPDATE ACCESS sau khi frontend ký (Step 2)
 */
const confirmUpdateAccess = async (currentUser, data) => {
    const { accessorAddress, txHash, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, txHash');
    }

    try {
        // Xác thực giao dịch
        console.log(`[confirmUpdateAccess] Xác thực txHash: ${txHash}`);
        const txVerification = await verifyTransactionOnBlockchain(txHash);

        if (!txVerification.confirmed) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch chưa được xác thực trên blockchain');
        }

        // Xác thực signer
        const normalizedSigner = txVerification.from?.toLowerCase();
        const normalizedPatient = currentUser.walletAddress.toLowerCase();

        if (normalizedSigner !== normalizedPatient) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Signer không match. Expected: ${normalizedPatient}, Got: ${normalizedSigner}`
            );
        }

        // Ghi audit log
        const finalDurationHours = durationHours || (expiresAt ? Math.ceil((expiresAt - Math.floor(Date.now() / 1000)) / 3600) : 0);

        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'UPDATE_ACCESS',
            entityType: 'ACCESS_CONTROL',
            entityId: null,
            txHash: txHash,
            status: 'SUCCESS',
            details: {
                note: `Patient updated access for ${accessorAddress} to ${level} via MetaMask`,
                accessorAddress,
                level,
                durationHours: finalDurationHours,
                expiresAt: expiresAt || 0,
            },
        });

        console.log(`[confirmUpdateAccess] Update access confirmed. TxHash: ${txHash}`);

        return {
            success: true,
            message: 'Cập nhật quyền truy cập thành công (MetaMask)',
            data: {
                accessorAddress,
                txHash,
                blockNumber: txVerification.blockNumber,
                level,
                durationHours: finalDurationHours,
                status: 'SUCCESS',
            },
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Xác nhận update access thất bại: ${error.message}`);
    }
};

export const accessControlService = {
    grantAccess,
    updateAccess,
    revokeAccess,
    checkAccess,
    getAccessGrant,
    getPatientGrants,
    prepareGrantAccessTransaction,
    confirmGrantAccess,
    prepareRevokeAccessTransaction,
    confirmRevokeAccess,
    prepareUpdateAccessTransaction,
    confirmUpdateAccess,
};

