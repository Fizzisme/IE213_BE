// src/controllers/admin.controller.js
// ═════════════════════════════════════════════════════════════════════════════════
// ADMIN CONTROLLER - PRIVILEGED OPERATIONS ONLY
// ═════════════════════════════════════════════════════════════════════════════════
//
// This controller handles ADMIN-ONLY privileged operations:
// createDoctor - Admin directly creates doctor accounts (no PENDING approval)
// createLabTech - Admin directly creates lab tech accounts (no PENDING approval)
// Patient blockchain self-registration được xử lý ở patient controller/service
//
// NOTE: User management operations (approve, reject, verify, soft-delete) are in
// adminUserController.js - this follows separation of concerns principle
// ═════════════════════════════════════════════════════════════════════════════════

import { adminService } from '~/services/admin.service';
import { StatusCodes } from 'http-status-codes';

// POST /admin/users/create-doctor - Admin tạo doctor trực tiếp
const createDoctor = async (req, res, next) => {
    try {
        const result = await adminService.prepareCreateDoctor({
            adminWalletAddress: req.user.walletAddress,
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
        });
        res.status(StatusCodes.OK).json({
            statusCode: StatusCodes.OK,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const confirmCreateDoctor = async (req, res, next) => {
    try {
        const result = await adminService.confirmCreateDoctor({
            currentUser: req.user,
            txHash: req.body.txHash,
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
        });
        res.status(StatusCodes.CREATED).json({
            statusCode: StatusCodes.CREATED,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

// POST /admin/users/create-labtech - Admin tạo lab tech trực tiếp
const createLabTech = async (req, res, next) => {
    try {
        const result = await adminService.prepareCreateLabTech({
            adminWalletAddress: req.user.walletAddress,
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
        });
        res.status(StatusCodes.OK).json({
            statusCode: StatusCodes.OK,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const confirmCreateLabTech = async (req, res, next) => {
    try {
        const result = await adminService.confirmCreateLabTech({
            currentUser: req.user,
            txHash: req.body.txHash,
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
        });
        res.status(StatusCodes.CREATED).json({
            statusCode: StatusCodes.CREATED,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

export const adminController = {
    createDoctor,
    confirmCreateDoctor,
    createLabTech,
    confirmCreateLabTech,
};
