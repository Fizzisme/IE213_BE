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

// Bệnh nhân xác nhận giao dịch cấp quyền sau khi ký trên frontend wallet
const confirmGrantAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmGrantAccess(req.user, req.body);
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

// Bệnh nhân xác nhận giao dịch cập nhật quyền sau khi ký trên frontend wallet
const confirmUpdateAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmUpdateAccess(req.user, req.body);
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

// Bệnh nhân xác nhận giao dịch thu hồi quyền sau khi ký trên frontend wallet
const confirmRevokeAccess = async (req, res, next) => {
    try {
        const result = await accessControlService.confirmRevokeAccess(req.user, req.body);
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

export const accessControlController = {
    grantAccess,
    confirmGrantAccess,
    updateAccess,
    confirmUpdateAccess,
    revokeAccess,
    confirmRevokeAccess,
    checkAccess,
    getAccessGrant,
    getMyGrants,
};
