import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { auditLogModel } from '~/models/auditLog.model';
import {
    prepareGrantAccessTx,
    prepareRevokeAccessTx,
    prepareUpdateAccessTx,
    verifyTransactionOnBlockchain,
} from '~/utils/metaMaskTxBuilder';
// import { notificationService } from '~/services/notification.service'; // REMOVED - not essential

/**
 * Service quản lý quyền truy cập dữ liệu y tế (Patient-centric)
 * - Bệnh nhân cấp quyền cho bác sĩ/lab tech
 * - Bệnh nhân cập nhật/thu hồi quyền
 * - Kiểm tra quyền truy cập
 */

const mapLevelToAccessLevel = (level) => {
    if (level === 'SENSITIVE') return 3;
    if (level === 'FULL') return 2;
    throw new ApiError(StatusCodes.BAD_REQUEST, `Mức quyền không hợp lệ: ${level}. Chỉ chấp nhận FULL hoặc SENSITIVE`);
};

const mapAccessLevelToName = (level) => {
    if (Number(level) === 3) return 'SENSITIVE';
    if (Number(level) === 2) return 'FULL';
    return 'UNKNOWN';
};

const toHexChainId = (chainId) => `0x${Number(chainId).toString(16)}`;

const normalizeDurationHours = (durationHours, expiresAt) => {
    let finalDurationHours = durationHours || 0;
    if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt <= now) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'expiresAt phải lớn hơn thời gian hiện tại');
        }
        finalDurationHours = Math.ceil((expiresAt - now) / 3600);
    }

    return finalDurationHours;
};

const buildPrepareResponse = (action, preparedTx, details = {}) => {
    const { unsignedTx, chainId, functionSignature } = preparedTx;

    return {
        message: 'Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).',
        action,
        txRequest: {
            to: unsignedTx.to,
            data: unsignedTx.data,
            value: unsignedTx.value || '0',
            chainId: toHexChainId(chainId),
        },
        suggestedTx: {
            from: unsignedTx.from,
            gasLimit: unsignedTx.gasLimit,
            gasPrice: unsignedTx.gasPrice,
            nonce: unsignedTx.nonce,
        },
        details: {
            functionSignature,
            chainId: Number(chainId),
            ...details,
        },
    };
};

const verifyConfirmedTxByUser = async (currentUser, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận giao dịch');
    }

    const verification = await verifyTransactionOnBlockchain(txHash);

    if (!verification.found) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy giao dịch trên blockchain');
    }

    if (!verification.confirmed) {
        throw new ApiError(StatusCodes.CONFLICT, 'Giao dịch chưa được xác nhận trên blockchain');
    }

    if (verification.status !== 'SUCCESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại trên blockchain');
    }

    const txFrom = verification.from?.toLowerCase();
    const userWallet = currentUser.walletAddress?.toLowerCase();
    if (!txFrom || !userWallet || txFrom !== userWallet) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Giao dịch không thuộc về user hiện tại. tx.from=${verification.from}, user.wallet=${currentUser.walletAddress}`
        );
    }

    return verification;
};

const findContractEvent = (receipt, eventName, predicate) => {
    const iface = blockchainContracts.read.accessControl.interface;
    const matchedLog = receipt.logs?.find((log) => {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name !== eventName) return false;
            return predicate(parsed.args);
        } catch {
            return false;
        }
    });

    if (!matchedLog) return null;
    return iface.parseLog(matchedLog);
};

// Bệnh nhân cấp quyền truy cập cho bác sĩ hoặc lab tech
const grantAccess = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    const finalDurationHours = normalizeDurationHours(durationHours, expiresAt);

    // level: FULL hoặc SENSITIVE
    mapLevelToAccessLevel(level);

    try {
        // Check existing grant to preserve business logic consistency
        try {
            const existingGrant = await blockchainContracts.read.accessControl.getAccessGrant(
                currentUser.walletAddress,
                accessorAddress
            );

            if (existingGrant.isActive) {
                throw new ApiError(
                    StatusCodes.BAD_REQUEST,
                    'Accessor đang có quyền truy cập active. Vui lòng revoke trước khi cấp mới.'
                );
            }
        } catch (checkErr) {
            if (checkErr instanceof ApiError) throw checkErr;

            // Nếu chưa từng có grant thì vẫn cho phép prepare grant
            if (!checkErr.message?.toLowerCase().includes('not found')) {
                throw new ApiError(StatusCodes.BAD_REQUEST, `Không thể xác minh grant hiện tại: ${checkErr.message}`);
            }
        }

        const preparedTx = await prepareGrantAccessTx(
            currentUser.walletAddress,
            accessorAddress,
            level,
            finalDurationHours
        );

        return buildPrepareResponse('GRANT_ACCESS', preparedTx, {
            accessorAddress,
            level,
            durationHours: finalDurationHours,
            expiresAt: expiresAt || 0,
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Cấp quyền thất bại: ${error.message}`);
    }
};

const confirmGrantAccess = async (currentUser, data) => {
    const { txHash, accessorAddress, level, durationHours, expiresAt } = data;

    if (!txHash || !accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: txHash, accessorAddress');
    }

    const verification = await verifyConfirmedTxByUser(currentUser, txHash);
    const receipt = await blockchainContracts.provider.getTransactionReceipt(txHash);

    const event = findContractEvent(
        receipt,
        'AccessGranted',
        (args) => args.patient.toLowerCase() === currentUser.walletAddress.toLowerCase()
            && args.accessor.toLowerCase() === accessorAddress.toLowerCase()
    );

    if (!event) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy event AccessGranted khớp với dữ liệu yêu cầu');
    }

    const eventLevel = Number(event.args.level);
    const eventLevelName = mapAccessLevelToName(eventLevel);
    const eventExpiresAt = Number(event.args.expiresAt);

    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: currentUser.walletAddress,
        action: 'GRANT_ACCESS',
        entityType: 'ACCESS_CONTROL',
        entityId: null,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Patient granted ${eventLevelName} access to ${accessorAddress}`,
            accessorAddress,
            level: level || eventLevelName,
            levelOnChain: eventLevel,
            durationHours: durationHours || 0,
            expiresAt: expiresAt || eventExpiresAt,
            blockNumber: verification.blockNumber,
        },
    });

    return {
        message: 'Cấp quyền truy cập thành công',
        txHash,
        blockNumber: verification.blockNumber,
        level: eventLevelName,
        expiresAt: eventExpiresAt,
    };
};

// Bệnh nhân cập nhật quyền truy cập
const updateAccess = async (currentUser, data) => {
    const { accessorAddress, level, durationHours, expiresAt } = data;

    if (!accessorAddress || !level) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress, level');
    }

    const finalDurationHours = normalizeDurationHours(durationHours, expiresAt);
    mapLevelToAccessLevel(level);

    try {
        // CHECK first: Verify access exists before updating
        try {
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

        const preparedTx = await prepareUpdateAccessTx(
            currentUser.walletAddress,
            accessorAddress,
            level,
            finalDurationHours
        );

        return buildPrepareResponse('UPDATE_ACCESS', preparedTx, {
            accessorAddress,
            level,
            durationHours: finalDurationHours,
            expiresAt: expiresAt || 0,
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Cập nhật quyền thất bại: ${error.message}`);
    }
};

const confirmUpdateAccess = async (currentUser, data) => {
    const { txHash, accessorAddress, level, durationHours, expiresAt } = data;

    if (!txHash || !accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: txHash, accessorAddress');
    }

    const verification = await verifyConfirmedTxByUser(currentUser, txHash);
    const receipt = await blockchainContracts.provider.getTransactionReceipt(txHash);

    const event = findContractEvent(
        receipt,
        'AccessUpdated',
        (args) => args.patient.toLowerCase() === currentUser.walletAddress.toLowerCase()
            && args.accessor.toLowerCase() === accessorAddress.toLowerCase()
    );

    if (!event) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy event AccessUpdated khớp với dữ liệu yêu cầu');
    }

    const eventLevel = Number(event.args.level);
    const eventLevelName = mapAccessLevelToName(eventLevel);
    const eventExpiresAt = Number(event.args.expiresAt);

    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: currentUser.walletAddress,
        action: 'UPDATE_ACCESS',
        entityType: 'ACCESS_CONTROL',
        entityId: null,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Patient updated access for ${accessorAddress} to ${eventLevelName}`,
            accessorAddress,
            level: level || eventLevelName,
            levelOnChain: eventLevel,
            durationHours: durationHours || 0,
            expiresAt: expiresAt || eventExpiresAt,
            blockNumber: verification.blockNumber,
        },
    });

    return {
        message: 'Cập nhật quyền truy cập thành công',
        txHash,
        blockNumber: verification.blockNumber,
        level: eventLevelName,
        expiresAt: eventExpiresAt,
    };
};

// Bệnh nhân thu hồi quyền truy cập
const revokeAccess = async (currentUser, data) => {
    const { accessorAddress } = data;

    if (!accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: accessorAddress');
    }

    try {
        const existingGrant = await blockchainContracts.read.accessControl.getAccessGrant(
            currentUser.walletAddress,
            accessorAddress
        );

        if (!existingGrant.isActive) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Grant không tồn tại hoặc đã bị thu hồi');
        }

        const preparedTx = await prepareRevokeAccessTx(
            currentUser.walletAddress,
            accessorAddress
        );

        return buildPrepareResponse('REVOKE_ACCESS', preparedTx, {
            accessorAddress,
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Thu hồi quyền thất bại: ${error.message}`);
    }
};

const confirmRevokeAccess = async (currentUser, data) => {
    const { txHash, accessorAddress } = data;

    if (!txHash || !accessorAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin bắt buộc: txHash, accessorAddress');
    }

    const verification = await verifyConfirmedTxByUser(currentUser, txHash);
    const receipt = await blockchainContracts.provider.getTransactionReceipt(txHash);

    const event = findContractEvent(
        receipt,
        'AccessRevoked',
        (args) => args.patient.toLowerCase() === currentUser.walletAddress.toLowerCase()
            && args.accessor.toLowerCase() === accessorAddress.toLowerCase()
    );

    if (!event) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy event AccessRevoked khớp với dữ liệu yêu cầu');
    }

    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: currentUser.walletAddress,
        action: 'REVOKE_ACCESS',
        entityType: 'ACCESS_CONTROL',
        entityId: null,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Patient revoked access from ${accessorAddress}`,
            accessorAddress,
            blockNumber: verification.blockNumber,
        },
    });

    return {
        message: 'Thu hồi quyền truy cập thành công',
        txHash,
        blockNumber: verification.blockNumber,
    };
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
    confirmGrantAccess,
    updateAccess,
    confirmUpdateAccess,
    revokeAccess,
    confirmRevokeAccess,
    checkAccess,
    getAccessGrant,
    getPatientGrants,
};
