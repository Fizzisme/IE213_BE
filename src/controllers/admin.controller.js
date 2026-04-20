// src/controllers/admin.controller.js
// ═════════════════════════════════════════════════════════════════════════════════
// ADMIN CONTROLLER - PRIVILEGED OPERATIONS ONLY
// ═════════════════════════════════════════════════════════════════════════════════
//
// This controller handles ADMIN-ONLY privileged operations:
// ✅ createDoctor - Admin directly creates doctor accounts (no PENDING approval)
// ✅ createLabTech - Admin directly creates lab tech accounts (no PENDING approval)
// ✅ registerPatientBlockchain - Admin registers patients on blockchain
//
// NOTE: User management operations (approve, reject, verify, soft-delete) are in
// adminUserController.js - this follows separation of concerns principle
// ═════════════════════════════════════════════════════════════════════════════════

import { adminService } from '~/services/admin.service';
import { StatusCodes } from 'http-status-codes';

// POST /admin/users/create-doctor - Admin tạo doctor trực tiếp
const createDoctor = async (req, res, next) => {
    try {
        const result = await adminService.createDoctor({
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
            adminId: req.user._id,
        });
        res.status(StatusCodes.CREATED).json({
            statusCode: StatusCodes.CREATED,
            message: 'Doctor account created successfully',
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

// POST /admin/users/create-labtech - Admin tạo lab tech trực tiếp
const createLabTech = async (req, res, next) => {
    try {
        const result = await adminService.createLabTech({
            email: req.body.email,
            password: req.body.password,
            nationId: req.body.nationId,
            walletAddress: req.body.walletAddress,
            adminId: req.user._id,
        });
        res.status(StatusCodes.CREATED).json({
            statusCode: StatusCodes.CREATED,
            message: 'Lab tech account created successfully',
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

// POST /admin/patients/:patientId/register-blockchain
const registerPatientBlockchain = async (req, res, next) => {
    try {
        const result = await adminService.registerPatientBlockchain({
            patientUserId: req.params.patientId,
            adminId: req.user._id,
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

export const adminController = {
    createDoctor,
    createLabTech,
    registerPatientBlockchain,
};
