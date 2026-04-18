// src/routes/v1/adminUser.route.js
import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { adminUserValidation } from '~/validations/adminUser.validation';
import { adminUserController } from '~/controllers/adminUser.controller';
import { adminController } from '~/controllers/admin.controller';

const Router = express.Router();

// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('ADMIN'));

/**
 * @swagger
 * /v1/admins/users:
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
 * /v1/admins/users/{id}:
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
 * /v1/admins/users/{id}/approve:
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
 * /v1/admins/users/{id}/reject:
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
 * /v1/admins/users/{id}/re-review:
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
 * /v1/admins/users/create-doctor:
 *   post:
 *     summary: Admin tạo tài khoản DOCTOR trực tiếp (ACTIVE ngay, không qua PENDING)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "doctor@hospital.com"
 *                 description: Email của bác sĩ
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "SecurePassword123"
 *                 description: Mật khẩu (tối thiểu 8 ký tự)
 *               nationId:
 *                 type: string
 *                 example: "123456789"
 *                 description: ID quốc gia/CMND (tuỳ chọn)
 *               walletAddress:
 *                 type: string
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D"
 *                 description: Wallet address cho blockchain (tuỳ chọn, nếu không hệ thống sẽ tạo)
 *     responses:
 *       201:
 *         description: Tài khoản bác sĩ đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Doctor account created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [DOCTOR]
 *                     status:
 *                       type: string
 *                       enum: [ACTIVE]
 *       400:
 *         description: Bad Request - Email hoặc password không hợp lệ
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       409:
 *         description: Conflict - Email đã tồn tại
 *       500:
 *         description: Internal Server Error - Blockchain transaction failed
 */
Router.post(
    '/users/create-doctor',
    adminUserValidation.createDoctor,
    adminController.createDoctor
);

/**
 * @swagger
 * /v1/admins/users/create-labtech:
 *   post:
 *     summary: Admin tạo tài khoản LAB_TECH trực tiếp (ACTIVE ngay, không qua PENDING)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "labtech@lab.com"
 *                 description: Email của nhân viên phòng lab
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "SecurePassword123"
 *                 description: Mật khẩu (tối thiểu 8 ký tự)
 *               nationId:
 *                 type: string
 *                 example: "987654321"
 *                 description: ID quốc gia/CMND (tuỳ chọn)
 *               walletAddress:
 *                 type: string
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7D"
 *                 description: Wallet address cho blockchain (tuỳ chọn, nếu không hệ thống sẽ tạo)
 *     responses:
 *       201:
 *         description: Tài khoản nhân viên lab đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lab technician account created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [LAB_TECH]
 *                     status:
 *                       type: string
 *                       enum: [ACTIVE]
 *       400:
 *         description: Bad Request - Email hoặc password không hợp lệ
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       409:
 *         description: Conflict - Email đã tồn tại
 *       500:
 *         description: Internal Server Error - Blockchain transaction failed
 */
Router.post(
    '/users/create-labtech',
    adminUserValidation.createLabTech,
    adminController.createLabTech
);

/**
 * @swagger
 * /v1/admins/users/{id}/verify-id:
 *   patch:
 *     summary: Verify CMND/ID document của user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần verify CMND
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isVerified
 *             properties:
 *               isVerified:
 *                 type: boolean
 *                 example: true
 *                 description: CMND hợp lệ hay không
 *               notes:
 *                 type: string
 *                 example: "CMND hợp lệ, thông tin match"
 *                 description: Ghi chú khi verify (tuỳ chọn)
 *     responses:
 *       200:
 *         description: CMND verified successfully
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: Conflict - User không ở trạng thái PENDING
 *       422:
 *         description: Validation error hoặc user chưa upload CMND
 */
Router.patch('/users/:id/verify-id', adminUserValidation.verifyIdDocument, adminUserController.verifyIdDocument);

/**
 * @swagger
 * /v1/admins/users/{id}/soft-delete:
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

/**
 * @swagger
 * /v1/admins/patients/{patientId}/register-blockchain:
 *   post:
 *     summary: Admin register patient trên blockchain
 *     description: |
 *       Admin register patient account trên AccountManager smart contract.
 *       Patient phải đã có wallet address trong authProviders.
 *       Gọi hàm registerPatient() on-chain bằng admin wallet.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         example: "69d4ca4483491dad2f6513f8"
 *         description: Patient User ID
 *     responses:
 *       200:
 *         description: Patient successfully registered on blockchain
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Patient successfully registered on blockchain"
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     walletAddress:
 *                       type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: Bad Request - Patient không có wallet hoặc blockchain call fail
 *       401:
 *         description: Unauthorized - Token không hợp lệ
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       404:
 *         description: Patient không tồn tại
 */
Router.post(
    '/patients/:patientId/register-blockchain',
    adminController.registerPatientBlockchain
);

export const adminUserRoute = Router;