import { StatusCodes } from 'http-status-codes';
import { blockchainEventSyncService } from '~/services/blockchainEventSync.service';

/**
 * @swagger
 * components:
 *   schemas:
 *     SyncEventsRequest:
 *       type: object
 *       properties:
 *         fromBlock:
 *           type: number
 *           description: Block bắt đầu đồng bộ
 *           example: 0
 *         toBlock:
 *           type: string
 *           description: Block kết thúc (mặc định 'latest')
 *           example: "latest"
 */

// Đồng bộ events từ blockchain về MongoDB
const syncEvents = async (req, res, next) => {
    try {
        const { fromBlock, toBlock } = req.body;
        const result = await blockchainEventSyncService.syncEvents(fromBlock || 0, toBlock || 'latest');
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy audit logs theo entity
const getAuditLogs = async (req, res, next) => {
    try {
        const { entityType, entityId } = req.params;
        const result = await blockchainEventSyncService.getAuditLogs(entityType, entityId);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy audit logs theo user
const getAuditLogsByUser = async (req, res, next) => {
    try {
        const result = await blockchainEventSyncService.getAuditLogsByUser(req.user._id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy tất cả audit logs (cho admin)
const getAllAuditLogs = async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await blockchainEventSyncService.getAllAuditLogs(
            parseInt(page) || 1,
            parseInt(limit) || 50
        );
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// 🆕 Feature 1: Bệnh nhân xem ai đã truy cập dữ liệu của họ
const getMyAccessAuditLog = async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const currentPatient = req.user.walletAddress;
        const result = await blockchainEventSyncService.getPatientAccessAuditLog(
            currentPatient,
            parseInt(page) || 1,
            parseInt(limit) || 50
        );
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const blockchainEventSyncController = {
    syncEvents,
    getAuditLogs,
    getAuditLogsByUser,
    getAllAuditLogs,
    getMyAccessAuditLog,
};
