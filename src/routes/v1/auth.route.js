import express from 'express';
import { authController } from '~/controllers/auth.controller';
import { authValidation } from '~/validations/auth.validation';
import { authMiddleware } from '~/middlewares/authMiddleware';

const Router = express.Router();

/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Register new user (Patient/Doctor/LabTech)
 *     tags: [Auth]
 *     description: |
 *       Đăng ký tài khoản mới. Bắt buộc phải có walletAddress.
 *       Sau khi đăng ký, user status = PENDING, chờ admin duyệt.
 *       Email và wallet phải là unique (không duplicate).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - nationId
 *               - walletAddress
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "patient@hospital.com"
 *                 description: Email người dùng (phải unique)
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "password123"
 *                 description: Mật khẩu (tối thiểu 8 ký tự)
 *               nationId:
 *                 type: string
 *                 pattern: '^\d{9}|\d{12}$'
 *                 example: "123456789"
 *                 description: CCCD/CMND (9 hoặc 12 chữ số)
 *               walletAddress:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 description: "Địa chỉ ví Ethereum (REQUIRED) - format: 0x + 40 hex chars"
 *     responses:
 *       201:
 *         description: User registered successfully, status = PENDING (waiting for admin approval)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   example: "69ce8d5f7f0f573cd0a67ba8"
 *                 walletAddress:
 *                   type: string
 *                   example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 blockchainStatus:
 *                   type: string
 *                   example: "PENDING"
 *       400:
 *         description: Validation error (missing walletAddress, invalid format, duplicate email/wallet)
 *       409:
 *         description: Conflict - Email hoặc wallet address đã được đăng ký
 */
Router.post('/register', authValidation.register, authController.register);
/**
 * @swagger
 * /v1/auth/login/nationId:
 *   post:
 *     summary: Login with CCCD/CMND and password
 *     tags: [Auth]
 *     description: Admin users should use POST /v1/admins/auth/login instead.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nationId
 *               - password
 *             properties:
 *               nationId:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Login successful. Tokens in HTTP-only cookies
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account pending, rejected, or inactive
 */
Router.post('/login/nationId', authValidation.loginByNationId, authController.loginByNationId);

/**
 * @swagger
 * /v1/auth/login/wallet:
 *   post:
 *     summary: Wallet login (2-phase)
 *     tags: [Auth]
 *     description: Phase 1 - send walletAddress only to get nonce; Phase 2 - send walletAddress + signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 type: string
 *               signature:
 *                 type: string
 *                 description: Required only in Phase 2
 *     responses:
 *       200:
 *         description: Phase 1 returns nonce; Phase 2 returns tokens
 */
Router.post('/login/wallet', authController.loginByWallet);

/**
 * @swagger
 * /v1/auth/refresh-token:
 *   post:
 *     summary: Làm mới access token (dùng lại refresh token)
 *     tags: [Auth]
 *     description: |
 *       Sử dụng refresh token để lấy access token mới khi access token hết hạn.
 *       
 *       **Flow:**
 *       1. User gọi endpoint này khi access token sắp hết hạn (hoặc đã hết)
 *       2. Server verify refresh token từ cookie
 *       3. Nếu hợp lệ → cấp access token mới
 *       4. Client nhận access token mới và tiếp tục sử dụng
 *       
 *       **Cấu hình Token:**
 *       - Access Token: 20 phút
 *       - Refresh Token: 14 ngày
 *       
 *       **Note:** Refresh token phải có trong HTTP-only cookie (không cần gửi body)
 *     responses:
 *       200:
 *         description: Refresh thành công - trả về access token mới
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: Mã access token mới
 *                 status:
 *                   type: string
 *                   example: "ACTIVE"
 *                 expiresIn:
 *                   type: string
 *                   example: "20 minutes"
 *                 message:
 *                   type: string
 *                   example: "Access token refreshed successfully"
 *       401:
 *         description: Unauthorized - Refresh token không hợp lệ hoặc hết hạn
 *       403:
 *         description: Forbidden - Tài khoản không ở trạng thái ACTIVE
 *       404:
 *         description: Not Found - User không tồn tại
 */
Router.post('/refresh-token', authController.refreshAccessToken);

/**
 * @swagger
 * /v1/auth/logout:
 *   delete:
 *     summary: Đăng xuất tài khoản (xóa accessToken và refreshToken trong cookie)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Logout thành công
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */
Router.delete('/logout', authController.logout);
export const authRoute = Router;
