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
 * /v1/admins/users/{id}/approve/prepare:
 *   post:
 *     summary: Chuẩn bị giao dịch duyệt patient (MetaMask prepare)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của patient cần duyệt
 *     responses:
 *       200:
 *         description: Transaction prepared successfully
 */
Router.post('/users/:id/approve/prepare', adminUserController.prepareApproveUser);

/**
 * @swagger
 * /v1/admins/users/{id}/approve/confirm:
 *   post:
 *     summary: Xác nhận duyệt patient sau khi MetaMask ký (addPatient)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của patient cần duyệt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: User approved and registered on-chain
 */
Router.post('/users/:id/approve/confirm', adminUserController.confirmApproveUser);

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
 *     summary: Chuẩn bị giao dịch tạo tài khoản DOCTOR (MetaMask prepare)
 *     description: |
 *       API này chỉ chuẩn bị transaction để frontend ký bằng MetaMask.
 *       Backend validate dữ liệu và trả `txRequest`, chưa tạo user trong DB ở bước này.
 *       Frontend phải gọi `/v1/admins/users/create-doctor/confirm` với `txHash` để hoàn tất.
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
 *               - walletAddress
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
 *                 description: Wallet address của DOCTOR để add role trên blockchain (bắt buộc)
 *     responses:
 *       200:
 *         description: Chuẩn bị giao dịch thành công
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
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 data:
 *                   type: object
 *                   properties:
 *                     action:
 *                       type: string
 *                       example: "ADMIN_ADD_DOCTOR"
 *                     txRequest:
 *                       type: object
 *                     suggestedTx:
 *                       type: object
 *                     details:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: string
 *                         nationId:
 *                           type: string
 *                           nullable: true
 *                         walletAddress:
 *                           type: string
 *       400:
 *         description: Bad Request - Dữ liệu không hợp lệ hoặc wallet address sai format
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       409:
 *         description: Conflict - Email đã tồn tại
 */
Router.post(
    '/users/create-doctor',
    adminUserValidation.createDoctor,
    adminController.createDoctor
);

/**
 * @swagger
 * /v1/admins/users/create-doctor/confirm:
 *   post:
 *     summary: Xác nhận tạo tài khoản DOCTOR sau khi MetaMask ký
 *     description: |
 *       Frontend gọi API này sau khi admin wallet ký và broadcast transaction addDoctor.
 *       Backend verify txHash, verify function addDoctor, sau đó mới tạo user/profile trong DB.
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
 *               - walletAddress
 *               - txHash
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               nationId:
 *                 type: string
 *               walletAddress:
 *                 type: string
 *               txHash:
 *                 type: string
 *                 example: "0xabc123def456..."
 *     responses:
 *       201:
 *         description: Tài khoản bác sĩ đã được tạo thành công
 *       400:
 *         description: Bad Request - txHash hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Tx không thuộc admin hiện tại hoặc không phải ADMIN
 *       404:
 *         description: Không tìm thấy transaction data
 *       409:
 *         description: Transaction chưa được xác nhận trên blockchain
 */
Router.post(
    '/users/create-doctor/confirm',
    adminUserValidation.createDoctor,
    adminController.confirmCreateDoctor
);

/**
 * @swagger
 * /v1/admins/users/create-labtech:
 *   post:
 *     summary: Chuẩn bị giao dịch tạo tài khoản LAB_TECH (MetaMask prepare)
 *     description: |
 *       API này chỉ chuẩn bị transaction để frontend ký bằng MetaMask.
 *       Backend validate dữ liệu và trả `txRequest`, chưa tạo user trong DB ở bước này.
 *       Frontend phải gọi `/v1/admins/users/create-labtech/confirm` với `txHash` để hoàn tất.
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
 *               - walletAddress
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
 *                 description: Wallet address của LAB_TECH để add role trên blockchain (bắt buộc)
 *     responses:
 *       200:
 *         description: Chuẩn bị giao dịch thành công
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
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 data:
 *                   type: object
 *                   properties:
 *                     action:
 *                       type: string
 *                       example: "ADMIN_ADD_LABTECH"
 *                     txRequest:
 *                       type: object
 *                     suggestedTx:
 *                       type: object
 *                     details:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: string
 *                         nationId:
 *                           type: string
 *                           nullable: true
 *                         walletAddress:
 *                           type: string
 *       400:
 *         description: Bad Request - Dữ liệu không hợp lệ hoặc wallet address sai format
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Không phải ADMIN
 *       409:
 *         description: Conflict - Email đã tồn tại
 */
Router.post(
    '/users/create-labtech',
    adminUserValidation.createLabTech,
    adminController.createLabTech
);

/**
 * @swagger
 * /v1/admins/users/create-labtech/confirm:
 *   post:
 *     summary: Xác nhận tạo tài khoản LAB_TECH sau khi MetaMask ký
 *     description: |
 *       Frontend gọi API này sau khi admin wallet ký và broadcast transaction addLabTech.
 *       Backend verify txHash, verify function addLabTech, sau đó mới tạo user/profile trong DB.
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
 *               - walletAddress
 *               - txHash
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               nationId:
 *                 type: string
 *               walletAddress:
 *                 type: string
 *               txHash:
 *                 type: string
 *                 example: "0xabc123def456..."
 *     responses:
 *       201:
 *         description: Tài khoản lab tech đã được tạo thành công
 *       400:
 *         description: Bad Request - txHash hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Tx không thuộc admin hiện tại hoặc không phải ADMIN
 *       404:
 *         description: Không tìm thấy transaction data
 *       409:
 *         description: Transaction chưa được xác nhận trên blockchain
 */
Router.post(
    '/users/create-labtech/confirm',
    adminUserValidation.createLabTech,
    adminController.confirmCreateLabTech
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
 *   delete:
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
Router.delete('/users/:id/soft-delete', adminUserController.softDeleteUser);

export const adminUserRoute = Router;