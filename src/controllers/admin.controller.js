// src/controllers/admin.controller.js
import { adminService } from '~/services/admin.service';
import { StatusCodes } from 'http-status-codes';

// GET /admin/users?status=PENDING&page=1&limit=10
const getUsers = async (req, res, next) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        const result = await adminService.getUsers({ status, search, page, limit });
        console.log(result);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

// GET /admin/users/:id
const getUserDetail = async (req, res, next) => {
    try {
        const user = await adminService.getUserDetail(req.params.id);
        res.status(StatusCodes.OK).json(user);
    } catch (err) {
        next(err);
    }
};

// PATCH /admin/users/:id/approve
const approveUser = async (req, res, next) => {
    try {
        const result = await adminService.approveUser({
            targetUserId: req.params.id,
            adminId: req.user._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

// PATCH /admin/users/:id/reject
const rejectUser = async (req, res, next) => {
    try {
        const result = await adminService.rejectUser({
            targetUserId: req.params.id,
            adminId: req.user._id,
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
        const result = await adminService.reReviewUser({
            targetUserId: req.params.id,
            adminId: req.user._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};
// Thêm hàm softDelete để đánh dấu user bị soft delete
const softDeleteUser = async (req, res, next) => {
    try {
        const result = await adminService.softDeleteUser({
            targetUserId: req.params.id,
            adminId: req.user._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

const verifyOnboarding = async (req, res, next) => {
    try {
        // Controller gom targetUserId + txHash + admin hiện tại để service verify giao dịch onboarding trên chain.
        const result = await adminService.verifyOnboarding({
            targetUserId: req.params.id,
            txHash: req.body.txHash,
            adminId: req.user._id,
        });
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

const getMyProfile = async (req, res, next) => {
    try {
        const result = await adminService.getMyProfile(req.user);
        return res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

export const adminController = {
    getUsers,
    getUserDetail,
    approveUser,
    rejectUser,
    reReviewUser,
    softDeleteUser,
    verifyOnboarding,
    getMyProfile,
};
