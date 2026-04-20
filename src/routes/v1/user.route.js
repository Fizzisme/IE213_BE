// src/routes/v1/user.route.js
import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { userController } from '~/controllers/user.controller';

const Router = express.Router();

// Tất cả route /users/* đều phải qua verifyToken
Router.use(verifyToken);

/**
 * @swagger
 * /v1/users/me:
 *   get:
 *     summary: Lấy thông tin user hiện tại (tất cả roles)
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       **Merge User + Role-specific Profile**
 *       
 *       Endpoint này trả về thông tin user + profile tương ứng với role:
 *       - DOCTOR → merge với Doctor profile (specialization, hospital, licenseNumber)
 *       - PATIENT → merge với Patient profile (gender, birthYear)
 *       - LAB_TECH → merge với LabTech profile (licenseNumber, certifications)
 *       - ADMIN → chỉ user info (không có profile role-specific)
 *       
 *       **Use Case:**
 *       Frontend gọi khi load app → get user info + profile 1 lần → show "Hello [name]" trên dashboard
 *       
 *       **Cấu trúc Response:**
 *       ```json
 *       {
 *         "id": "...",
 *         "role": "DOCTOR",
 *         "email": "...",
 *         "walletAddress": "0x...",
 *         "fullName": "Nguyễn Văn A",
 *         "phone": "0901234567",
 *         "status": "ACTIVE",
 *         "profile": {
 *           "specialization": "Nội khoa",
 *           "hospital": "BV ABC",
 *           "licenseNumber": "..."
 *         }
 *       }
 *       ```
 *     responses:
 *       200:
 *         description: Thành công - Trả về user info + role-specific profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: User ID (MongoDB ObjectId)
 *                 role:
 *                   type: string
 *                   enum: [PATIENT, DOCTOR, LAB_TECH, ADMIN]
 *                 email:
 *                   type: string
 *                   nullable: true
 *                   description: Email (nếu dùng LOCAL auth)
 *                 walletAddress:
 *                   type: string
 *                   nullable: true
 *                   description: Wallet address (nếu dùng WALLET auth)
 *                 fullName:
 *                   type: string
 *                   nullable: true
 *                 phone:
 *                   type: string
 *                   nullable: true
 *                 avatar:
 *                   type: string
 *                   nullable: true
 *                   description: Avatar image URL
 *                 status:
 *                   type: string
 *                   enum: [PENDING, ACTIVE, REJECTED, INACTIVE]
 *                 hasProfile:
 *                   type: boolean
 *                   description: "Tài khoản đã tạo profile role-specific (doctor/patient)"
 *                 profile:
 *                   type: object
 *                   nullable: true
 *                   description: Role-specific profile data
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - Token không hợp lệ hoặc hết hạn
 *       404:
 *         description: Not Found - User không tồn tại
 *       403:
 *         description: Forbidden - Tài khoản bị xóa hoặc vô hiệu hóa
 */
Router.get('/me', userController.getMyProfile);

/**
 * @swagger
 * /v1/users/me:
 *   patch:
 *     summary: Cập nhật thông tin user cơ bản (tên, phone, avatar)
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Cập nhật các thông tin cơ bản của user:
 *       - fullName: Tên đầy đủ
 *       - phone: Số điện thoại
 *       - avatar: URL ảnh đại diện
 *       
 *       **Lưu ý:** Không thể cập nhật:
 *       - role, status (quản lý bởi admin)
 *       - walletAddress, email, nationId (quản lý bởi auth system)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *               phone:
 *                 type: string
 *                 example: "0901234567"
 *               avatar:
 *                 type: string
 *                 example: "https://example.com/avatar.jpg"
 *     responses:
 *       200:
 *         description: Cập nhật thành công - Trả về user info updated
 *       400:
 *         description: Bad request - Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized - Token không hợp lệ
 *       404:
 *         description: Not Found - User không tồn tại
 */
Router.patch('/me', userController.updateMyProfile);

/**
 * @swagger
 * /v1/users/me/password:
 *   patch:
 *     summary: Đổi mật khẩu (chỉ dành cho LOCAL auth users)
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Đổi mật khẩu cho tài khoản sử dụng LOCAL authentication.
 *       
 *       **Yêu cầu:**
 *       - Người dùng phải cung cấp mật khẩu cũ (xác minh)
 *       - Mật khẩu mới phải khác mật khẩu cũ
 *       - Mật khẩu mới phải tối thiểu 8 ký tự
 *       
 *       **Lưu ý:** Wallet auth users không có password → endpoint sẽ throw error
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "oldPass123"
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "newPass456"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       400:
 *         description: Bad request - Mật khẩu không hợp lệ hoặc quá ngắn
 *       401:
 *         description: Unauthorized - Mật khẩu cũ không chính xác
 *       404:
 *         description: Not Found - User không tồn tại
 */
Router.patch('/me/password', userController.changePassword);

export const userRoute = Router;
