// src/routes/v1/adminUser.route.js
import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { adminUserValidation } from '~/validations/adminUser.validation';
import { adminUserController } from '~/controllers/adminUser.controller';

const Router = express.Router();

// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('ADMIN'));

/**
 * @swagger
 * /v1/admin/users:
 *   get:
 *     summary: Lấy danh sách user theo trạng thái (mặc định PENDING)
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, REJECTED, INACTIVE]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Nếu true, lấy danh sách user đã bị soft delete
 *     responses:
 *       200:
 *         description: Danh sách user phân trang
 */
Router.get('/users', adminUserValidation.listUsers, adminUserController.getUsers);

/**
 * @swagger
 * /v1/admin/users/{id}:
 *   get:
 *     summary: Xem chi tiết 1 user
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết user
 */
Router.get('/users/:id', adminUserController.getUserDetail);

/**
 * @swagger
 * /v1/admin/users/{id}/approve:
 *   patch:
 *     summary: Duyệt user → ACTIVE
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User approved successfully
 */
Router.patch('/users/:id/approve', adminUserController.approveUser);

/**
 * @swagger
 * /v1/admin/users/{id}/reject:
 *   patch:
 *     summary: Từ chối user → REJECTED
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User rejected
 */
Router.patch('/users/:id/reject', adminUserValidation.rejectUser, adminUserController.rejectUser);

/**
 * @swagger
 * /v1/admin/users/{id}/re-review:
 *   patch:
 *     summary: Phục hồi user REJECTED → PENDING (xét duyệt lại)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User chuyển về PENDING
 */
Router.patch('/users/:id/re-review', adminUserController.reReviewUser);

// Route api softdelete cho admin 
/**
 * @swagger
 * /v1/admin/users/{id}/soft-delete:
 *   delete:
 *     summary: Soft delete user + cascade xóa theo role
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User đã bị soft delete
 */
Router.delete('/users/:id/soft-delete', adminUserController.softDeleteUser);

export const adminUserRoute = Router;