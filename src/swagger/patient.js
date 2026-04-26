/**
 * @swagger
 * components:
 *   schemas:
 *     CreatePatientRequest:
 *       type: object
 *       required:
 *         - phoneNumber
 *         - fullName
 *         - dob
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
 *         dob:
 *           type: number
 *           description: Unix timestamp milliseconds
 *           example: 946684800000
 *     AppointmentRequest:
 *       type: object
 *       required:
 *         - appointmentDateTime
 *         - serviceId
 *         - doctorId
 *       properties:
 *         appointmentDateTime:
 *           type: string
 *           format: date-time
 *           example: '2026-05-01T09:30:00.000Z'
 *         serviceId:
 *           type: string
 *           example: 662222222222222222222222
 *         doctorId:
 *           type: string
 *           example: 661111111111111111111111
 *         description:
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
 *             description:
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
 *                   description: Mệt, khát nước nhiều
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
 * v1/patients/appointments:
 *   post:
 *     summary: Tạo lịch hẹn mới cho bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *               - serviceId
 *               - appointmentDate
 *               - appointmentTime
 *             properties:
 *               doctorId:
 *                 type: string
 *                 example: "69ba902193958774013b93e9"
 *               serviceId:
 *                 type: string
 *                 example: "69ba902193958774013b93e9"
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-25"
 *               appointmentTime:
 *                 type: string
 *                 format: time
 *                 example: "10:00"
 *               notes:
 *                 type: string
 *                 example: "Cần tư vấn thêm"
 *     responses:
 *       201:
 *         description: Tạo lịch hẹn thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/appointments/me:
 *   get:
 *     summary: Lấy danh sách lịch hẹn của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       doctorId:
 *                         type: object
 *                       serviceId:
 *                         type: object
 *                       appointmentDate:
 *                         type: string
 *                       appointmentTime:
 *                         type: string
 *                       status:
 *                         type: string
 *                       notes:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/services:
 *   get:
 *     summary: Lấy danh sách tất cả dịch vụ khám bệnh
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách dịch vụ thành công
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       price:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/appointments/{id}/cancel:
 *   patch:
 *     summary: Hủy lịch hẹn của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lịch hẹn
 *     responses:
 *       200:
 *         description: Hủy lịch hẹn thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy lịch hẹn
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/appointments/{id}/reschedule:
 *   patch:
 *     summary: Đặt lại lịch hẹn của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lịch hẹn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentDate
 *               - appointmentTime
 *             properties:
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-26"
 *               appointmentTime:
 *                 type: string
 *                 format: time
 *                 example: "14:00"
 *     responses:
 *       200:
 *         description: Đặt lại lịch hẹn thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy lịch hẹn
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/me:
 *   get:
 *     summary: Lấy danh sách thông báo của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thông báo thành công
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       isRead:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/{notificationId}/read:
 *   patch:
 *     summary: Đánh dấu thông báo đã đọc
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của thông báo
 *     responses:
 *       200:
 *         description: Đánh dấu đã đọc thành công
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/read-all:
 *   patch:
 *     summary: Đánh dấu tất cả thông báo đã đọc
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đánh dấu tất cả đã đọc thành công
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/unread/count/{userId}:
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
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Lấy số lượng thành công
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
 *                   type: number
 *                   example: 5
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/delete-all:
 *   delete:
 *     summary: Xóa tất cả thông báo của bệnh nhân
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Xóa tất cả thông báo thành công
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * v1/patients/notifications/{notificationId}:
 *   delete:
 *     summary: Xóa một thông báo cụ thể
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của thông báo cần xóa
 *     responses:
 *       200:
 *         description: Xóa thông báo thành công
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi server
 */
