/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Register new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               nationId:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */

/**
 * @swagger
 * /v1/auth/login/nationId:
 *   post:
 *     summary: Login with CCCD/CMND and password
 *     tags: [Auth]
 *     description: Admin users should use POST /v1/admin/auth/login instead.
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

/**
 * @swagger
 * v1/auth/logout:
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

/**
 * @swagger
 * /v1/auth/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
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
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: "69ba902193958774013b93e9"
 *                     role:
 *                       type: string
 *                       enum: [PATIENT, DOCTOR, ADMIN]
 *                       example: "PATIENT"
 *                     status:
 *                       type: string
 *                       enum: [PENDING, ACTIVE, REJECTED, INACTIVE]
 *                       example: "ACTIVE"
 *                     hasProfile:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /v1/auth/refresh-token:
 *   post:
 *     summary: Làm mới accessToken khi hết hạn
 *     tags: [Auth]
 *     description: Gửi refreshToken từ cookie để lấy accessToken mới. Refresh token có hạn 14 ngày.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Làm mới token thành công
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
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token mới, hạn 9 giờ
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Refresh token không tồn tại, hết hạn hoặc không hợp lệ
 *       403:
 *         description: Tài khoản không hoạt động
 *       500:
 *         description: Lỗi server
 */
