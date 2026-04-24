/**
 * @swagger
 * /v1/admin/auth/login:
 *   post:
 *     summary: Admin login (separate secure endpoint)
 *     tags: [Admin Auth]
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
 *                 example: '012345678901'
 *                 description: CCCD/CMND số (9 hoặc 12 chữ số)
 *               password:
 *                 type: string
 *                 example: 'password123'
 *                 description: Mật khẩu (tối thiểu 8 ký tự)
 *     responses:
 *       200:
 *         description: Admin login thành công. Trả về accessToken và refreshToken trong cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT token dùng cho các request tiếp theo (20 minutes)
 *                 refreshToken:
 *                   type: string
 *                   description: Token dùng để refresh accessToken (14 days)
 *       400:
 *         description: Validation error - Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized - Thông tin đăng nhập không hợp lệ
 *       403:
 *         description: |
 *           Forbidden - Lý do có thể:
 *           - Người dùng không phải admin
 *           - Tài khoản admin bị vô hiệu hóa/xóa
 *           - Hồ sơ admin chưa được kích hoạt
 */
