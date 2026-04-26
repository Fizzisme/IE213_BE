// src/routes/v1/admin.route.js
import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { adminValidation } from '~/validations/admin.validation';
import { adminController } from '~/controllers/admin.controller';
import { chainCheck } from '~/middlewares/chainCheck';

const Router = express.Router();

// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('ADMIN'));

// Api lấy độ toàn bộ users
Router.get('/users', adminValidation.listUsers, adminController.getUsers);
// Api lấy chi tiết 1 user
Router.get('/users/:id', adminController.getUserDetail);
// Api approve 1 user
Router.patch('/users/:id/approve', adminController.approveUser);
// Api reject 1 user
Router.patch('/users/:id/reject', adminValidation.rejectUser, adminController.rejectUser);
// Api xác minh onboarding gasless trên blockchain
Router.post('/users/:id/verify-onboarding', chainCheck, adminController.verifyOnboarding);
// Api phục hồi user
Router.patch('/users/:id/re-review', adminController.reReviewUser);
// Api soft delete user
Router.delete('/users/:id/soft-delete', adminController.softDeleteUser);

export const adminRoute = Router;
