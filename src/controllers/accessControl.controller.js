import { StatusCodes } from 'http-status-codes';
import { accessControlService } from '~/services/accessControl.service';

/**
 * @swagger
 * components:
 *   schemas:
 *     GrantAccessRequest:
 *       type: object
 *       required:
 *         - accessorAddress
 *         - level
 *       properties:
 *         accessorAddress:
 *           type: string
 *           description: Địa chỉ ví bác sĩ/lab tech được cấp quyền
 *           example: "0x123..."
 *         level:
 *           type: string
 *           enum: [FULL, SENSITIVE]
 *           description: Mức quyền truy cập
 *           example: "FULL"
 *         durationHours:
 *           type: number
 *           description: Thời hạn quyền (giờ), 0 = vĩnh viễn
 *           example: 24
 */

// Bệnh nhân cấp quyền truy cập
const grantAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.grantAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Bệnh nhân cập nhật quyền truy cập
const updateAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.updateAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Bệnh nhân thu hồi quyền truy cập
const revokeAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.revokeAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Kiểm tra quyền truy cập
const checkAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.checkAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy thông tin quyền truy cập
const getAccessGrant = async (req, res, next) => {
    try {
        const result = await accessControlService.getAccessGrant(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy danh sách grant của bệnh nhân
const getMyGrants = async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await accessControlService.getPatientGrants(
            req.user,
            parseInt(page) || 1,
            parseInt(limit) || 50
        );
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// ==============================================================================
// LU\u1ed2NG METAMASK: CHU\u1ea8N B\u1eca & X\u00c1C NH\u1eaaN H\u00c0NG\n// ==============================================================================

/**
 * GET /access-control/grant/prepare (Step 1)
 * Chuẩn bị unsigned transaction cho grant access
 */
const prepareGrantAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.prepareGrantAccessTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * POST /access-control/grant/confirm (Step 2)
 * Xác nhận grant access sau khi ký với MetaMask
 */
const confirmGrantAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmGrantAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * GET /access-control/revoke/prepare (Step 1)
 * Chuẩn bị unsigned transaction cho revoke access
 */
const prepareRevokeAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.prepareRevokeAccessTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * POST /access-control/revoke/confirm (Step 2)
 * Xác nhận revoke access sau khi ký với MetaMask
 */
const confirmRevokeAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmRevokeAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * PUT /access-control/update/prepare (Step 1)
 * Chuẩn bị unsigned transaction cho update access
 */
const prepareUpdateAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.prepareUpdateAccessTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * PATCH /access-control/update/confirm (Step 2)
 * Xác nhận update access sau khi ký với MetaMask
 */
const confirmUpdateAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmUpdateAccess(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const accessControlController = {
    grantAccess,
    updateAccess,
    revokeAccess,
    checkAccess,
    getAccessGrant,
    getMyGrants,
    prepareGrantAccess,
    confirmGrantAccess,
    prepareRevokeAccess,
    confirmRevokeAccess,
    prepareUpdateAccess,
    confirmUpdateAccess,
};
