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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, REJECTED, INACTIVE]
 *         description: Lọc theo trạng thái (mặc định PENDING)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số lượng user mỗi trang
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Nếu true, lấy danh sách user đã bị soft delete
 *     responses:
 *       200:
 *         description: Danh sách user phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 */
Router.get('/users', adminUserValidation.listUsers, adminUserController.getUsers);

/**
 * @swagger
 * /v1/admin/users/{id}:
 *   get:
 *     summary: Xem chi tiết 1 user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần xem
 *     responses:
 *       200:
 *         description: Chi tiết user
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 */
Router.get('/users/:id', adminUserController.getUserDetail);

/**
 * @swagger
 * /v1/admin/users/{id}/approve:
 *   patch:
 *     summary: Duyệt user → ACTIVE
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần duyệt
 *     responses:
 *       200:
 *         description: User approved successfully
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: Conflict - User không ở trạng thái PENDING
 */
Router.patch('/users/:id/approve', adminUserController.approveUser);

/**
 * @swagger
 * /v1/admin/users/{id}/reject:
 *   patch:
 *     summary: Từ chối user → REJECTED
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần từ chối
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Thông tin không hợp lệ"
 *                 description: Lý do từ chối (tối thiểu 3 ký tự)
 *     responses:
 *       200:
 *         description: User rejected
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: Conflict - User không ở trạng thái PENDING
 *       422:
 *         description: Validation error - Lý do không hợp lệ
 */
Router.patch('/users/:id/reject', adminUserValidation.rejectUser, adminUserController.rejectUser);

/**
 * @swagger
 * /v1/admin/users/{id}/re-review:
 *   patch:
 *     summary: Phục hồi user REJECTED → PENDING (xét duyệt lại)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần phục hồi
 *     responses:
 *       200:
 *         description: User chuyển về PENDING
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: Conflict - User không ở trạng thái REJECTED
 */
Router.patch('/users/:id/re-review', adminUserController.reReviewUser);

/**
 * @swagger
 * /v1/admin/users/{id}/soft-delete:
 *   patch:
 *     summary: Soft delete user bằng cách cập nhật trạng thái + cascade theo role
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần xóa mềm
 *     responses:
 *       200:
 *         description: User đã được đánh dấu soft delete
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: Conflict - User đã bị xóa trước đó
 */
Router.patch('/users/:id/soft-delete', adminUserController.softDeleteUser);
Router.delete('/users/:id/soft-delete', adminUserController.softDeleteUser);

export const adminUserRoute = Router;