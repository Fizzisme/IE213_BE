// src/controllers/adminUser.controller.js
import { adminUserService } from '~/services/adminUser.service';
import { StatusCodes } from 'http-status-codes';

// GET /admin/users?status=PENDING&page=1&limit=10
const getUsers = async (req, res, next) => {
    try {
        const result = await adminUserService.getUsers(req.query);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

// GET /admin/users/:id
const getUserDetail = async (req, res, next) => {
    try {
        const user = await adminUserService.getUserDetail(req.params.id);
        res.status(StatusCodes.OK).json(user);
    } catch (err) {
        next(err);
    }
};

// PATCH /admin/users/:id/approve
const approveUser = async (req, res, next) => {
    try {
        const result = await adminUserService.approveUser({
            targetUserId: req.params.id,
            adminId: req.jwtDecoded._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

// PATCH /admin/users/:id/reject
const rejectUser = async (req, res, next) => {
    try {
        const result = await adminUserService.rejectUser({
            targetUserId: req.params.id,
            adminId: req.jwtDecoded._id,
            reason: req.body.reason,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

// PATCH /admin/users/:id/re-review
const reReviewUser = async (req, res, next) => {
    try {
        const result = await adminUserService.reReviewUser({
            targetUserId: req.params.id,
            adminId: req.jwtDecoded._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};
// PATCH /admin/users/:id/soft-delete
const softDeleteUser = async (req, res, next) => {
    try {
        const result = await adminUserService.softDeleteUser({
            targetUserId: req.params.id,
            adminId: req.jwtDecoded._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};
export const adminUserController = {
    getUsers,
    getUserDetail,
    approveUser,
    rejectUser,
    reReviewUser,
    softDeleteUser
};