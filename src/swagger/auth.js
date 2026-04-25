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
 *               registrationSignature:
 *                 type: string
 *                 description: (Optional) EIP-712 signature for gasless onboarding if first time login
 *     responses:
 *       200:
 *         description: Phase 1 returns nonce; Phase 2 returns tokens và thông tin profile
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
