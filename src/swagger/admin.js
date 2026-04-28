/**
 * @swagger
 * components:
 *   schemas:
 *     AdminApprovePayload:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Vui lòng xác nhận đăng ký vai trò trên MetaMask
 *         needsBlockchain:
 *           type: boolean
 *           example: true
 *         role:
 *           type: string
 *           example: DOCTOR
 *         targetWallet:
 *           type: string
 *           nullable: true
 *           example: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *         registrationSignature:
 *           type: string
 *           nullable: true
 *         blockchain:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/BlockchainAction'
 *             - type: object
 *               properties:
 *                 method:
 *                   type: string
 *                   example: registerStaff
 */

/**
 * @swagger
 * /v1/admins/users:
 *   get:
 *     summary: Lấy danh sách user theo trạng thái hoặc deleted flag
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, REJECTED, INACTIVE]
 *         description: Lọc theo trạng thái, mặc định PENDING
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm user
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Danh sách user phân trang
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Không phải ADMIN
 */

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
 *       404:
 *         description: User không tồn tại
 */

/**
 * @swagger
 * /v1/admins/users/{id}/approve:
 *   patch:
 *     summary: Duyệt user và trả metadata blockchain nếu cần admin ký MetaMask
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
 *         description: Trả về thông tin để admin ký MetaMask nếu cần sync blockchain
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AdminApprovePayload'
 *             example:
 *               statusCode: 200
 *               message: Success
 *               data:
 *                 message: Vui lòng xác nhận đăng ký vai trò trên MetaMask
 *                 needsBlockchain: true
 *                 role: DOCTOR
 *                 targetWallet: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                 registrationSignature: null
 *                 blockchain:
 *                   contractAddress: 0x1234567890abcdef1234567890abcdef12345678
 *                   method: registerStaff
 *                   args:
 *                     - 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                     - '2'
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: User không ở trạng thái PENDING
 */

/**
 * @swagger
 * /v1/admins/users/{id}/verify-onboarding:
 *   post:
 *     summary: Verify giao dịch admin đăng ký patient gasless hoặc staff role trên Blockchain
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
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
 *             $ref: '#/components/schemas/VerifyTxRequest'
 *     responses:
 *       200:
 *         description: Verify thành công và user được ACTIVE + synced
 *       400:
 *         description: Tx sai contract, sai method, sai args hoặc sai ví signer admin
 */

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
 *                 example: Thông tin không hợp lệ
 *                 description: Lý do từ chối (tối thiểu 3 ký tự)
 *     responses:
 *       200:
 *         description: User rejected
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: User không ở trạng thái PENDING
 *       422:
 *         description: Validation error
 */

/**
 * @swagger
 * /v1/admins/users/{id}/re-review:
 *   patch:
 *     summary: Phục hồi user REJECTED → PENDING
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User chuyển về PENDING
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: User không ở trạng thái REJECTED
 */

/**
 * @swagger
 * /v1/admins/users/{id}/soft-delete:
 *   delete:
 *     summary: Soft delete user + cascade xóa theo role
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
 *         description: User đã bị soft delete
 *       404:
 *         description: User không tồn tại
 *       409:
 *         description: User đã bị xóa trước đó
 */

 /**
  * @swagger
  * /v1/admins/me:
  *   get:
  *     summary: Lấy thông tin cá nhân admin hiện tại
  *     tags: [Admin]
  *     security:
  *       - bearerAuth: []
  *     responses:
  *       200:
  *         description: Thông tin admin hiện tại
  *       401:
  *         description: Unauthorized
  *       403:
  *         description: Forbidden - Không phải ADMIN
  */
