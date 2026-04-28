/**
 * @swagger
 * components:
 *   schemas:
 *     CreatePatientRequest:
 *       type: object
 *       required:
 *         - phoneNumber
 *         - fullName
 *         - birthYear
 *       properties:
 *         phoneNumber:
 *           type: string
 *           minLength: 8
 *           maxLength: 15
 *           pattern: "^(0|\\+84)(3|5|7|8|9)[0-9]{8}$"
 *           example: "0912345678"
 *         fullName:
 *           type: string
 *           minLength: 2
 *           example: "Nguyễn Văn A"
 *         gender:
 *           type: string
 *           enum: [M, F]
 *           example: "M"
 *         birthYear:
 *           type: number
 *           description: Năm sinh của bệnh nhân
 *           example: 1999
 *     AppointmentRequest:
 *       type: object
 *       required:
 *         - appointmentDateTime
 *         - serviceId
 *       properties:
 *         appointmentDateTime:
 *           type: string
 *           format: date-time
 *           example: '2026-05-01T09:30:00.000Z'
 *         serviceId:
 *           type: string
 *           example: 662222222222222222222222
 *         patientDescription:
 *           type: string
 *           example: Mệt, khát nước nhiều
 *     AppointmentBusinessPayload:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Đặt lịch thành công
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: 663333333333333333333333
 *             patientId:
 *               type: string
 *               example: 664444444444444444444444
 *             doctorId:
 *               type: string
 *               example: 661111111111111111111111
 *             serviceId:
 *               type: string
 *               example: 662222222222222222222222
 *             appointmentDateTime:
 *               type: string
 *               format: date-time
 *             patientDescription:
 *               type: string
 *             price:
 *               type: number
 *               example: 250000
 *             status:
 *               type: string
 *               enum: [PENDING, CONFIRMED, COMPLETED, CANCELLED]
 *               example: PENDING
 *         blockchain:
 *           allOf:
 *             - $ref: '#/components/schemas/BlockchainAction'
 *             - type: object
 *               properties:
 *                 action:
 *                   type: string
 *                   example: GRANT_ACCESS
 *     AppointmentCancelPayload:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Hủy lịch hẹn thành công
 *         appointment:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             status:
 *               type: string
 *               example: CANCELLED
 *         blockchain:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/BlockchainAction'
 *             - type: object
 *               properties:
 *                 action:
 *                   type: string
 *                   example: REVOKE_ACCESS
 */

/**
 * @swagger
 * /v1/patients:
 *   post:
 *     summary: Tạo hồ sơ bệnh nhân cho user hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePatientRequest'
 *     responses:
 *       201:
 *         description: Tạo hồ sơ bệnh nhân thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */

/**
 * @swagger
 * /v1/patients/me:
 *   get:
 *     summary: Lấy hồ sơ bệnh nhân của chính người dùng
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy hồ sơ bệnh nhân
 */

/**
 * @swagger
 * /v1/patients/appointments:
 *   post:
 *     summary: Tạo lịch hẹn mới và nhận blockchain metadata để grant access ngay trên MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AppointmentRequest'
 *     responses:
 *       201:
 *         description: Tạo lịch thành công, có thể kèm blockchain metadata để ký MetaMask
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AppointmentBusinessPayload'
 *             example:
 *               statusCode: 201
 *               message: Created
 *               data:
 *                 message: Đặt lịch thành công
 *                 data:
 *                   _id: 663333333333333333333333
 *                   patientId: 664444444444444444444444
 *                   doctorId: 661111111111111111111111
 *                   serviceId: 662222222222222222222222
 *                   appointmentDateTime: '2026-05-01T09:30:00.000Z'
 *                   patientDescription: Mệt, khát nước nhiều
 *                   price: 250000
 *                   status: PENDING
 *                 blockchain:
 *                   action: GRANT_ACCESS
 *                   contractAddress: 0x1234567890abcdef1234567890abcdef12345678
 *                   method: grantAccess
 *                   args:
 *                     - 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                     - 24
 *                   doctorWallet: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                   durationHours: 24
 *                   message: Vui lòng ký xác nhận cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask
 *               timestamp: '2026-04-26T08:10:00.000Z'
 *               path: /v1/patients/appointments
 *               responseTime: 19 ms
 */

/**
 * @swagger
 * /v1/patients/appointments/me:
 *   get:
 *     summary: Lấy danh sách lịch hẹn của bệnh nhân hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch hẹn
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/cancel:
 *   patch:
 *     summary: Hủy lịch hẹn và nhận blockchain metadata để revoke access nếu cần
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hủy lịch thành công
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AppointmentCancelPayload'
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/reschedule:
 *   patch:
 *     summary: Đặt lại lịch hẹn đã bị hủy
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appointmentDateTime:
 *                 type: string
 *                 format: date-time
 *                 example: '2026-05-03T09:30:00.000Z'
 *     responses:
 *       200:
 *         description: Đổi lịch thành công
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/prepare-grant-access:
 *   get:
 *     summary: Lấy lại metadata để bệnh nhân ký grantAccess trên MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trả về contractAddress, method, args, doctorWallet và durationHours
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/BlockchainAction'
 *                         - type: object
 *                           properties:
 *                             method:
 *                               type: string
 *                               example: grantAccess
 *                             appointmentId:
 *                               type: string
 *                               example: 663333333333333333333333
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/verify-grant-access:
 *   post:
 *     summary: Verify giao dịch grantAccess sau khi bệnh nhân đã ký MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *         description: Verify thành công, appointment được chuyển sang CONFIRMED
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/prepare-revoke-access:
 *   get:
 *     summary: Lấy lại metadata để bệnh nhân ký revokeAccess trên MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trả về contractAddress, method, args và doctorWallet
 */

/**
 * @swagger
 * /v1/patients/appointments/{id}/verify-revoke-access:
 *   post:
 *     summary: Verify giao dịch revokeAccess sau khi bệnh nhân đã ký MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *         description: Verify thành công
 */

/**
 * @swagger
 * /v1/patients/services:
 *   get:
 *     summary: Lấy danh sách dịch vụ khám bệnh
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách dịch vụ thành công
 */

/**
 * @swagger
 * /v1/patients/medical-records:
 *   get:
 *     summary: Lấy danh sách hồ sơ bệnh án của bệnh nhân hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter theo trạng thái, có thể truyền nhiều giá trị, ví dụ CREATED,HAS_RESULT
 *         example: CREATED,HAS_RESULT
 *     responses:
 *       200:
 *         description: Danh sách hồ sơ bệnh án của bệnh nhân hiện tại
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           type:
 *                             type: string
 *                           status:
 *                             type: string
 *                           clinicalNote:
 *                             type: string
 *                             nullable: true
 *                           note:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 */

/**
 * @swagger
 * /v1/patients/medical-records/{medicalRecordId}:
 *   get:
 *     summary: Lấy chi tiết một hồ sơ bệnh án của bệnh nhân hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: medicalRecordId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: ID hồ sơ bệnh án
 *     responses:
 *       200:
 *         description: Chi tiết hồ sơ bệnh án
 *       403:
 *         description: Bạn không có quyền xem hồ sơ bệnh án này
 *       404:
 *         description: Không tìm thấy hồ sơ bệnh án
 */

/**
 * @swagger
 * /v1/patients/notifications/me:
 *   get:
 *     summary: Lấy danh sách thông báo của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: isRead
 *         required: false
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lấy danh sách thông báo thành công
 */

/**
 * @swagger
 * /v1/patients/notifications/{notificationId}/read:
 *   patch:
 *     summary: Đánh dấu một thông báo là đã đọc
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đánh dấu đã đọc thành công
 */

/**
 * @swagger
 * /v1/patients/notifications/read-all:
 *   patch:
 *     summary: Đánh dấu tất cả thông báo là đã đọc
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đánh dấu tất cả đã đọc thành công
 */

/**
 * @swagger
 * /v1/patients/notifications/unread/count/{userId}:
 *   get:
 *     summary: Lấy số lượng thông báo chưa đọc
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lấy số lượng thông báo chưa đọc thành công
 */

/**
 * @swagger
 * /v1/patients/notifications/delete-all:
 *   delete:
 *     summary: Xóa tất cả thông báo của bệnh nhân hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Xóa tất cả thông báo thành công
 */

/**
 * @swagger
 * /v1/patients/notifications/{notificationId}:
 *   delete:
 *     summary: Xóa một thông báo của bệnh nhân hiện tại
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thông báo thành công
 */
