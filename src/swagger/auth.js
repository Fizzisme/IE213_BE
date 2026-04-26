/**
 * @swagger
 * components:
 *   schemas:
 *     ApiEnvelope:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: integer
 *           example: 200
 *         message:
 *           type: string
 *           example: Success
 *         data:
 *           type: object
 *           description: Business payload thực tế của endpoint
 *         timestamp:
 *           type: string
 *           format: date-time
 *         path:
 *           type: string
 *           example: /v1/auth/login/wallet
 *         responseTime:
 *           type: string
 *           example: 24 ms
 *     VerifyTxRequest:
 *       type: object
 *       required:
 *         - txHash
 *       properties:
 *         txHash:
 *           type: string
 *           example: 0x0f2d97c53d9e6c8fdb6db4bb4b4ce3c17c4e93f47c1f6d4af82ef5e8c0a3b123
 *     BlockchainAction:
 *       type: object
 *       properties:
 *         action:
 *           type: string
 *           example: GRANT_ACCESS
 *         contractAddress:
 *           type: string
 *           example: 0x1234567890abcdef1234567890abcdef12345678
 *         method:
 *           type: string
 *           example: grantAccess
 *         args:
 *           type: array
 *           items:
 *             oneOf:
 *               - type: string
 *               - type: integer
 *               - type: boolean
 *         message:
 *           type: string
 *           example: Vui lòng ký xác nhận giao dịch trên MetaMask
 *         doctorWallet:
 *           type: string
 *           example: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *         durationHours:
 *           type: integer
 *           example: 24
 *     AuthRegisterRequest:
 *       type: object
 *       required:
 *         - nationId
 *         - email
 *         - password
 *       properties:
 *         nationId:
 *           type: string
 *           example: '012345678901'
 *         email:
 *           type: string
 *           format: email
 *           example: patient@example.com
 *         password:
 *           type: string
 *           minLength: 8
 *           example: password123
 *     AuthNationIdLoginRequest:
 *       type: object
 *       required:
 *         - nationId
 *         - password
 *       properties:
 *         nationId:
 *           type: string
 *           example: '012345678901'
 *         password:
 *           type: string
 *           minLength: 8
 *           example: password123
 *     AuthWalletPhase1Request:
 *       type: object
 *       required:
 *         - walletAddress
 *       properties:
 *         walletAddress:
 *           type: string
 *           example: 0xabc123abc123abc123abc123abc123abc123abcd
 *     AuthWalletPhase2Request:
 *       type: object
 *       required:
 *         - walletAddress
 *         - signature
 *       properties:
 *         walletAddress:
 *           type: string
 *           example: 0xabc123abc123abc123abc123abc123abc123abcd
 *         signature:
 *           type: string
 *           description: Chữ ký nonce nhận từ phase 1
 *           example: 0x9f57c4b0c85c5d2d18c5e9e98edb3d4ea8ef6f7d1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1b
 *         registrationSignature:
 *           type: string
 *           nullable: true
 *           description: Chữ ký message REGISTER_ZUNI_PATIENT cho user wallet đăng nhập lần đầu
 *           example: 0x7f57c4b0c85c5d2d18c5e9e98edb3d4ea8ef6f7d1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1b
 */

/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Đăng ký user local bằng CCCD/CMND + email + password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRegisterRequest'
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userId:
 *                           type: string
 *                           example: 66223344556677889900aabb
 *       406:
 *         description: Người dùng đã tồn tại
 */

/**
 * @swagger
 * /v1/auth/login/nationId:
 *   post:
 *     summary: Đăng nhập bằng CCCD/CMND và password
 *     tags: [Auth]
 *     description: Tài khoản ADMIN phải đi qua endpoint riêng `/v1/admins/auth/login`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthNationIdLoginRequest'
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, accessToken và refreshToken được set vào cookie HTTP-only
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         refreshToken:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: PATIENT
 *                         status:
 *                           type: string
 *                           example: ACTIVE
 *                         hasProfile:
 *                           type: boolean
 *                           example: true
 *       401:
 *         description: Thông tin đăng nhập không hợp lệ
 *       403:
 *         description: Tài khoản pending, rejected, inactive hoặc là ADMIN
 */

/**
 * @swagger
 * /v1/auth/login/wallet:
 *   post:
 *     summary: Đăng nhập bằng ví - endpoint chính cho frontend
 *     tags: [Auth]
 *     description: |
 *       Luồng 2 bước.
 *       - Phase 1: gửi `walletAddress` để lấy `nonce`
 *       - Phase 2: gửi `walletAddress` + `signature` để verify login
 *       - Nếu là user wallet lần đầu, có thể gửi thêm `registrationSignature` để phục vụ gasless onboarding cho patient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/AuthWalletPhase1Request'
 *               - $ref: '#/components/schemas/AuthWalletPhase2Request'
 *     responses:
 *       200:
 *         description: Phase 1 trả về nonce, Phase 2 trả về tokens và metadata người dùng
 *         content:
 *           application/json:
 *             examples:
 *               phase1:
 *                 summary: Lấy nonce để ký bằng MetaMask
 *                 value:
 *                   statusCode: 200
 *                   message: Success
 *                   data:
 *                     nonce: Login 1714123456789 - 7dcb7969-76d3-4f71-96fc-a8d16c6c95f3
 *                   timestamp: '2026-04-26T08:00:00.000Z'
 *                   path: /v1/auth/login/wallet
 *                   responseTime: 12 ms
 *               phase2:
 *                 summary: Đăng nhập thành công sau khi verify signature
 *                 value:
 *                   statusCode: 200
 *                   message: Success
 *                   data:
 *                     accessToken: jwt_access_token
 *                     refreshToken: jwt_refresh_token
 *                     role: PATIENT
 *                     status: ACTIVE
 *                     hasProfile: true
 *                   timestamp: '2026-04-26T08:01:00.000Z'
 *                   path: /v1/auth/login/wallet
 *                   responseTime: 33 ms
 */

/**
 * @swagger
 * /v1/auth/login-by-wallet:
 *   post:
 *     summary: Đăng nhập bằng ví - alias backward compatible
 *     tags: [Auth]
 *     description: Alias của `/v1/auth/login/wallet`, request/response giống hệt.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/AuthWalletPhase1Request'
 *               - $ref: '#/components/schemas/AuthWalletPhase2Request'
 *     responses:
 *       200:
 *         description: Hoạt động giống `/v1/auth/login/wallet`
 */

/**
 * @swagger
 * /v1/auth/logout:
 *   delete:
 *     summary: Đăng xuất tài khoản và xóa cookie access/refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *         content:
 *           application/json:
 *             example:
 *               statusCode: 200
 *               message: Đăng xuất thành công
 *               timestamp: '2026-04-26T08:02:00.000Z'
 *               path: /v1/auth/logout
 *               responseTime: 3 ms
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /v1/auth/me:
 *   get:
 *     summary: Lấy thông tin user hiện tại từ token/cookie
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin user hiện tại
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userId:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: DOCTOR
 *                         status:
 *                           type: string
 *                           example: ACTIVE
 *                         hasProfile:
 *                           type: boolean
 *                           example: true
 *       401:
 *         description: Unauthorized
 */
