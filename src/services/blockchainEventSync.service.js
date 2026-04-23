import { blockchainContracts } from '~/blockchain/contract';
import { auditLogModel } from '~/models/auditLog.model';
import { labOrderModel } from '~/models/labOrder.model';

/**
 * Service đồng bộ on-chain events về MongoDB
 * Step 10: Audit & truy xuất
 * - Lắng nghe events từ blockchain
 * - Đồng bộ về MongoDB để query nhanh
 */

// Mapping RecordStatus enum
const RECORD_STATUS_MAP = {
    0: 'ORDERED',
    1: 'CONSENTED',
    2: 'IN_PROGRESS',
    3: 'RESULT_POSTED',
    4: 'DOCTOR_REVIEWED',
    5: 'COMPLETE',
};

// Mapping RecordType enum
const RECORD_TYPE_MAP = {
    0: 'GENERAL',
    1: 'HIV_TEST',
    2: 'DIABETES_TEST',
    3: 'LAB_RESULT',
};

// Đồng bộ tất cả events từ một block range
const syncEvents = async (fromBlock = 0, toBlock = 'latest') => {
    const results = {
        recordAdded: 0,
        recordStatusUpdated: 0,
        labResultPosted: 0,
        clinicalInterpretationAdded: 0,
        accessGranted: 0,
        accessRevoked: 0,
        accountRegistered: 0,
        statusChanged: 0,
        errors: [],
    };

    try {
        // 1. Sync RecordAdded events
        const recordAddedFilter = blockchainContracts.read.ehrManager.filters.RecordAdded();
        const recordAddedEvents = await blockchainContracts.read.ehrManager.queryFilter(recordAddedFilter, fromBlock, toBlock);
        for (const event of recordAddedEvents) {
            try {
                await processRecordAdded(event);
                results.recordAdded++;
            } catch (error) {
                results.errors.push({ event: 'RecordAdded', error: error.message });
            }
        }

        // 2. Sync RecordStatusUpdated events
        const statusUpdatedFilter = blockchainContracts.read.ehrManager.filters.RecordStatusUpdated();
        const statusUpdatedEvents = await blockchainContracts.read.ehrManager.queryFilter(statusUpdatedFilter, fromBlock, toBlock);
        for (const event of statusUpdatedEvents) {
            try {
                await processRecordStatusUpdated(event);
                results.recordStatusUpdated++;
            } catch (error) {
                results.errors.push({ event: 'RecordStatusUpdated', error: error.message });
            }
        }

        // 3. Sync LabResultPosted events
        const labResultFilter = blockchainContracts.read.ehrManager.filters.LabResultPosted();
        const labResultEvents = await blockchainContracts.read.ehrManager.queryFilter(labResultFilter, fromBlock, toBlock);
        for (const event of labResultEvents) {
            try {
                await processLabResultPosted(event);
                results.labResultPosted++;
            } catch (error) {
                results.errors.push({ event: 'LabResultPosted', error: error.message });
            }
        }

        // 4. Sync ClinicalInterpretationAdded events
        const interpretationFilter = blockchainContracts.read.ehrManager.filters.ClinicalInterpretationAdded();
        const interpretationEvents = await blockchainContracts.read.ehrManager.queryFilter(interpretationFilter, fromBlock, toBlock);
        for (const event of interpretationEvents) {
            try {
                await processClinicalInterpretationAdded(event);
                results.clinicalInterpretationAdded++;
            } catch (error) {
                results.errors.push({ event: 'ClinicalInterpretationAdded', error: error.message });
            }
        }

        // 5. Sync AccessGranted events
        const accessGrantedFilter = blockchainContracts.read.accessControl.filters.AccessGranted();
        const accessGrantedEvents = await blockchainContracts.read.accessControl.queryFilter(accessGrantedFilter, fromBlock, toBlock);
        for (const event of accessGrantedEvents) {
            try {
                await processAccessGranted(event);
                results.accessGranted++;
            } catch (error) {
                results.errors.push({ event: 'AccessGranted', error: error.message });
            }
        }

        // 6. Sync AccessRevoked events
        const accessRevokedFilter = blockchainContracts.read.accessControl.filters.AccessRevoked();
        const accessRevokedEvents = await blockchainContracts.read.accessControl.queryFilter(accessRevokedFilter, fromBlock, toBlock);
        for (const event of accessRevokedEvents) {
            try {
                await processAccessRevoked(event);
                results.accessRevoked++;
            } catch (error) {
                results.errors.push({ event: 'AccessRevoked', error: error.message });
            }
        }

        // 7. Sync AccountRegistered events
        const accountRegisteredFilter = blockchainContracts.read.accountManager.filters.AccountRegistered();
        const accountRegisteredEvents = await blockchainContracts.read.accountManager.queryFilter(accountRegisteredFilter, fromBlock, toBlock);
        for (const event of accountRegisteredEvents) {
            try {
                await processAccountRegistered(event);
                results.accountRegistered++;
            } catch (error) {
                results.errors.push({ event: 'AccountRegistered', error: error.message });
            }
        }

        // 8. Sync StatusChanged events
        const statusChangedFilter = blockchainContracts.read.accountManager.filters.StatusChanged();
        const statusChangedEvents = await blockchainContracts.read.accountManager.queryFilter(statusChangedFilter, fromBlock, toBlock);
        for (const event of statusChangedEvents) {
            try {
                await processStatusChanged(event);
                results.statusChanged++;
            } catch (error) {
                results.errors.push({ event: 'StatusChanged', error: error.message });
            }
        }
    } catch (error) {
        results.errors.push({ general: error.message });
    }

    return results;
};

// Process RecordAdded event
const processRecordAdded = async (event) => {
    const { recordId, patient, author, orderHash, orderIpfsHash, timestamp } = event.args;
    await auditLogModel.createLog({
        walletAddress: author,
        action: 'RECORD_ADDED_ON_CHAIN',
        entityType: 'LAB_ORDER',
        entityId: recordId.toString(),
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Record ${recordId} added on-chain`,
            recordId: recordId.toString(),
            patient,
            author,
            orderHash,
            orderIpfsHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process RecordStatusUpdated event
const processRecordStatusUpdated = async (event) => {
    const { recordId, status, timestamp } = event.args;
    const statusName = RECORD_STATUS_MAP[Number(status)] || 'UNKNOWN';

    // Cập nhật trạng thái trong MongoDB nếu có
    const labOrder = await labOrderModel.LabOrderModel.findOne({ blockchainRecordId: recordId.toString() });
    if (labOrder) {
        labOrder.sampleStatus = statusName;
        await labOrder.save();
    }

    await auditLogModel.createLog({
        action: 'RECORD_STATUS_UPDATED_ON_CHAIN',
        entityType: 'LAB_ORDER',
        entityId: recordId.toString(),
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Record ${recordId} status updated to ${statusName} on-chain`,
            recordId: recordId.toString(),
            status: statusName,
            statusCode: Number(status),
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process LabResultPosted event
const processLabResultPosted = async (event) => {
    const { recordId, labTech, labResultHash, labResultIpfsHash, timestamp } = event.args;

    // Cập nhật trong MongoDB nếu có
    const labOrder = await labOrderModel.LabOrderModel.findOne({ blockchainRecordId: recordId.toString() });
    if (labOrder) {
        labOrder.labResultHash = labResultHash;
        labOrder.labResultIpfsHash = labResultIpfsHash;
        await labOrder.save();
    }

    await auditLogModel.createLog({
        walletAddress: labTech,
        action: 'LAB_RESULT_POSTED_ON_CHAIN',
        entityType: 'LAB_ORDER',
        entityId: recordId.toString(),
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Lab result posted for record ${recordId} on-chain`,
            recordId: recordId.toString(),
            labTech,
            labResultHash,
            labResultIpfsHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process ClinicalInterpretationAdded event
const processClinicalInterpretationAdded = async (event) => {
    const { recordId, doctor, interpretationHash, interpretationIpfsHash, timestamp } = event.args;

    // Cập nhật trong MongoDB nếu có
    const labOrder = await labOrderModel.LabOrderModel.findOne({ blockchainRecordId: recordId.toString() });
    if (labOrder) {
        labOrder.interpretationHash = interpretationHash;
        labOrder.interpretationIpfsHash = interpretationIpfsHash;
        await labOrder.save();
    }

    await auditLogModel.createLog({
        walletAddress: doctor,
        action: 'CLINICAL_INTERPRETATION_ADDED_ON_CHAIN',
        entityType: 'LAB_ORDER',
        entityId: recordId.toString(),
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Clinical interpretation added for record ${recordId} on-chain`,
            recordId: recordId.toString(),
            doctor,
            interpretationHash,
            interpretationIpfsHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process AccessGranted event
const processAccessGranted = async (event) => {
    const { patient, accessor, level, expiresAt, timestamp } = event.args;
    await auditLogModel.createLog({
        walletAddress: patient,
        action: 'ACCESS_GRANTED_ON_CHAIN',
        entityType: 'ACCESS_CONTROL',
        entityId: null,
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Access granted to ${accessor} on-chain`,
            patient,
            accessor,
            level: Number(level),
            expiresAt: Number(expiresAt),
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process AccessRevoked event
const processAccessRevoked = async (event) => {
    const { patient, accessor, timestamp } = event.args;
    await auditLogModel.createLog({
        walletAddress: patient,
        action: 'ACCESS_REVOKED_ON_CHAIN',
        entityType: 'ACCESS_CONTROL',
        entityId: null,
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Access revoked from ${accessor} on-chain`,
            patient,
            accessor,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process AccountRegistered event
const processAccountRegistered = async (event) => {
    const { account, role, status, timestamp } = event.args;
    await auditLogModel.createLog({
        walletAddress: account,
        action: 'ACCOUNT_REGISTERED_ON_CHAIN',
        entityType: 'USER',
        entityId: account,
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Account ${account} registered on-chain`,
            account,
            role: Number(role),
            status: Number(status),
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Process StatusChanged event
const processStatusChanged = async (event) => {
    const { account, oldStatus, newStatus, timestamp } = event.args;
    await auditLogModel.createLog({
        walletAddress: account,
        action: 'STATUS_CHANGED_ON_CHAIN',
        entityType: 'USER',
        entityId: account,
        txHash: event.transactionHash,
        chainId: event.chainId || null,
        status: 'SUCCESS',
        details: {
            note: `Account ${account} status changed on-chain`,
            account,
            oldStatus: Number(oldStatus),
            newStatus: Number(newStatus),
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
        },
    });
};

// Lấy audit logs theo entity
const getAuditLogs = async (entityType, entityId) => {
    return await auditLogModel.getLogsByEntity(entityType, entityId);
};

// Lấy audit logs theo user
const getAuditLogsByUser = async (userId) => {
    return await auditLogModel.getLogsByUser(userId);
};

// Lấy tất cả audit logs (cho admin)
const getAllAuditLogs = async (page = 1, limit = 50) => {
    const skip = (page - 1) * limit;
    const logs = await auditLogModel.AuditLogModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    const total = await auditLogModel.AuditLogModel.countDocuments();
    return { logs, total, page, limit };
};

// 🆕 Feature 1: Audit log dashboard - xem ai đã truy cập dữ liệu của bệnh nhân
// Truy vấn tất cả actions liên quan tới bệnh nhân (GRANT_ACCESS, VIEW_RECORD, POST_RESULT, etc)
const getPatientAccessAuditLog = async (patientWalletAddress, page = 1, limit = 50) => {
    const skip = (page - 1) * limit;

    // Tìm tất cả audit logs nơi:
    // - Action là GRANT_ACCESS, UPDATE_ACCESS, REVOKE_ACCESS (quản lý quyền)
    // - Hoặc oldData/newData chứa patient address (thay đổi dữ liệu bệnh nhân)
    const logs = await auditLogModel.AuditLogModel.find({
        $or: [
            {
                action: { $in: ['GRANT_ACCESS', 'UPDATE_ACCESS', 'REVOKE_ACCESS'] },
                'newData.patientAddress': patientWalletAddress
            },
            {
                action: { $in: ['CREATE_LAB_ORDER', 'CONSENT_LAB_ORDER', 'POST_LAB_RESULT', 'ADD_CLINICAL_INTERPRETATION'] },
                'newData.patientAddress': patientWalletAddress
            },
            {
                walletAddress: patientWalletAddress  // Actions thực hiện bởi bệnh nhân
            }
        ]
    })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await auditLogModel.AuditLogModel.countDocuments({
        $or: [
            {
                action: { $in: ['GRANT_ACCESS', 'UPDATE_ACCESS', 'REVOKE_ACCESS'] },
                'newData.patientAddress': patientWalletAddress
            },
            {
                action: { $in: ['CREATE_LAB_ORDER', 'CONSENT_LAB_ORDER', 'POST_LAB_RESULT', 'ADD_CLINICAL_INTERPRETATION'] },
                'newData.patientAddress': patientWalletAddress
            },
            {
                walletAddress: patientWalletAddress
            }
        ]
    });

    return {
        logs,
        total,
        page,
        limit,
        summary: {
            description: 'All access and modification logs related to your data',
            actions: logs.map(log => ({
                action: log.action,
                actor: log.walletAddress,
                timestamp: log.createdAt,
                status: log.status
            }))
        }
    };
};

export const blockchainEventSyncService = {
    syncEvents,
    getAuditLogs,
    getAuditLogsByUser,
    getAllAuditLogs,
    getPatientAccessAuditLog,
};
