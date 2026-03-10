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
export const adminUserController = {
    getUsers,
};