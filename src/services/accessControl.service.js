import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { provider } from '~/blockchain/provider';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
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

    // Feature 3: Support expiresAt (Unix timestamp) as alternative to durationHours
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
        // ⭐ FIX: Use patient wallet instead of admin wallet
        // Smart contract requires msg.sender to be the patient
        if (!blockchainContracts.patient.accessControl) {
            throw new ApiError(StatusCodes.BAD_REQUEST,
                'Test patient wallet not configured. Add TEST_PATIENT_PRIVATE_KEY to .env.local');
        }

        // ✅ AUTO-REVOKE PATTERN: Check if access already exists
        try {
            console.log(`📋 Checking existing access: patient=${currentUser.walletAddress}, accessor=${accessorAddress}`);
            const existingGrant = await blockchainContracts.read.accessControl.getAccessGrant(
                currentUser.walletAddress,
                accessorAddress
            );

            if (existingGrant.isActive) {
                console.log('⚠️ Existing grant found, auto-revoking before granting new access...');
                const revokeX = await blockchainContracts.patient.accessControl.revokeAccess(accessorAddress);
                const revokeReceipt = await revokeX.wait();
                if (!revokeReceipt || revokeReceipt.status !== 1) {
                    throw new Error('Auto-revoke transaction failed');
                }
                console.log('✅ Auto-revoke successful:', revokeReceipt.hash);

                // Wait a bit before granting new access to avoid race conditions
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (checkErr) {
            // If grant doesn't exist or other error, continue with grant
            if (!checkErr.message?.includes('Grant not found')) {
                console.warn('⚠️ Check existing grant warning:', checkErr.message);
            }
        }

        // ✅ NOW grant new access
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

        // Feature 4: Send notification to doctor/accessor (REMOVED - not essential for workflow)
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

    // Feature 3: Support expiresAt (Unix timestamp) as alternative to durationHours
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

        // Feature 4: Send notification to doctor/accessor (REMOVED - not essential for workflow)
        const expiresAtTimestamp = expiresAt || (finalDurationHours > 0 ? Math.floor(Date.now() / 1000) + (finalDurationHours * 3600) : 0);
        // Notification removed - focus on core workflow instead
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

        // Feature 4: Send notification to doctor/accessor (REMOVED - not essential for workflow)
        // Notification removed - focus on core workflow instead
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

export const accessControlService = {
    grantAccess,
    updateAccess,
    revokeAccess,
    checkAccess,
    getAccessGrant,
    getPatientGrants,
};
