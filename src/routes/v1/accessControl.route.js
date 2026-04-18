import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { accessControlController } from '~/controllers/accessControl.controller';

const Router = express.Router();

// Tất cả route /access-control/* đều phải qua verifyToken
Router.use(verifyToken);

/**
 * @swagger
 * components:
 *   schemas:
 *     GrantAccessRequest:
 *       type: object
 *       required:
 *         - accessorAddress
 *         - level
 *       properties:
 *         accessorAddress:
 *           type: string
 *           description: Địa chỉ ví bác sĩ/lab tech được cấp quyền
 *           example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *         level:
 *           type: string
 *           enum: [FULL, SENSITIVE]
 *           description: "Mức quyền: FULL(xem/phục vụ nghiệp vụ chuẩn), SENSITIVE(cao hơn cho dữ liệu nhạy cảm như HIV)"
 *           example: "FULL"
 *         expiresAt:
 *           type: number
 *           description: "(NEW Feature 3) Unix timestamp khi quyền hết hạn - thiên vị hơn durationHours. Nếu không cung cấp, dùng durationHours."
 *           example: 1720000000
 *         durationHours:
 *           type: number
 *           description: "Thời hạn quyền (giờ), 0 = vĩnh viễn cho đến khi revoke. Bỏ qua nếu expiresAt được cung cấp."
 *           example: 168
 *     RevokeAccessRequest:
 *       type: object
 *       required:
 *         - accessorAddress
 *       properties:
 *         accessorAddress:
 *           type: string
 *           description: Địa chỉ ví bị thu hồi quyền
 *           example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *     CheckAccessRequest:
 *       type: object
 *       required:
 *         - patientAddress
 *         - accessorAddress
 *         - requiredLevel
 *       properties:
 *         patientAddress:
 *           type: string
 *           description: Địa chỉ ví bệnh nhân
 *           example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *         accessorAddress:
 *           type: string
 *           description: Địa chỉ ví người truy cập (bác sĩ/lab tech)
 *           example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *         requiredLevel:
 *           type: string
 *           enum: [NONE, EMERGENCY, FULL, SENSITIVE]
 *           description: "Mức quyền cần kiểm tra: NONE(mặc định), EMERGENCY(khẩn cấp-bác sĩ ACTIVE có quyền mặc định), FULL, SENSITIVE"
 *           example: "FULL"
 */

/**
 * @swagger
 * /v1/access-control/grant:
 *   post:
 *     summary: Bệnh nhân cấp quyền truy cập cho bác sĩ/lab tech (Step 2) + Feature 3 Enhancement
 *     description: |
 *       Bệnh nhân cấp quyền cho bác sĩ hoặc lab tech để họ có thể truy cập dữ liệu y tế của mình.
 *       Đây là bước BẮT BUỘC trước khi bác sĩ có thể tạo lab order cho bệnh nhân.
 *       Backend gọi AccessControl.grantAccess(accessor, level, durationHours) on-chain.
 *       Nếu đã có grant hợp lệ (chưa hết hạn), sẽ báo lỗi AlreadyHasAccess - cần revoke trước.
 *
 *       **Feature 3: Time-Bound Grants Enhancement**
 *       - Hỗ trợ `expiresAt` (Unix timestamp) làm cách chính để set thời hạn.
 *       - Nếu cung cấp `expiresAt`, bỏ qua `durationHours` (expiresAt được ưu tiên).
 *       - Validation: expiresAt phải > thời gian hiện tại.
 *     tags: [Access Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrantAccessRequest'
 *           examples:
 *             grant_full_7days_new:
 *               summary: "(NEW Feature 3) Cấp quyền FULL hết hạn trong 7 ngày qua expiresAt"
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 level: "FULL"
 *                 expiresAt: 1720000000
 *             grant_full_7days:
 *               summary: Cấp quyền FULL trong 7 ngày (cách cũ dùng durationHours)
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 level: "FULL"
 *                 durationHours: 168
 *             grant_sensitive_permanent:
 *               summary: Cấp quyền SENSITIVE vĩnh viễn (cho bác sĩ điều trị chính)
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 level: "SENSITIVE"
 *                 durationHours: 0
 *     responses:
 *       200:
 *         description: Cấp quyền thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cấp quyền truy cập thành công"
 *                 txHash:
 *                   type: string
 *                   description: Hash giao dịch blockchain
 *                   example: "0xabc123def456..."
 *       400:
 *         description: Lỗi dữ liệu (expiresAt quá khứ, AlreadyHasAccess, v.v.)
 *       403:
 *         description: Không phải bệnh nhân
 */
Router.post('/grant', authorizeRoles('PATIENT'), accessControlController.grantAccess);

/**
 * @swagger
 * /v1/access-control/update:
 *   patch:
 *     summary: Bệnh nhân cập nhật quyền truy cập + Feature 3 Enhancement
 *     description: |
 *       Bệnh nhân cập nhật mức quyền hoặc thời hạn cho bác sĩ/lab tech đã có grant.
 *       Backend gọi AccessControl.updateAccess(accessor, level, durationHours) on-chain.
 *       Grant phải đang active (chưa bị revoke).
 *
 *       **Feature 3: Time-Bound Grants Enhancement**
 *       - Hỗ trợ `expiresAt` (Unix timestamp) làm cách chính để set thời hạn.
 *       - Nếu cung cấp `expiresAt`, bỏ qua `durationHours` (expiresAt được ưu tiên).
 *     tags: [Access Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrantAccessRequest'
 *           examples:
 *             upgrade_to_sensitive_new:
 *               summary: "(NEW Feature 3) Nâng cấp FULL → SENSITIVE với hết hạn cố định"
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 level: "SENSITIVE"
 *                 expiresAt: 1720000000
 *             upgrade_to_sensitive:
 *               summary: Nâng cấp quyền từ FULL lên SENSITIVE
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 level: "SENSITIVE"
 *                 durationHours: 720
 *     responses:
 *       200:
 *         description: Cập nhật quyền thành công
 *       400:
 *         description: Grant không tồn tại hoặc đã hết hạn
 *       403:
 *         description: Không phải bệnh nhân
 */
Router.patch('/update', authorizeRoles('PATIENT'), accessControlController.updateAccess);

/**
 * @swagger
 * /v1/access-control/revoke:
 *   post:
 *     summary: Bệnh nhân thu hồi quyền truy cập
 *     description: |
 *       Bệnh nhân thu hồi quyền truy cập của bác sĩ/lab tech.
 *       Backend gọi AccessControl.revokeAccess(accessor) on-chain.
 *       Sau khi revoke, bác sĩ/lab tech không thể truy cập dữ liệu của bệnh nhân nữa.
 *     tags: [Access Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RevokeAccessRequest'
 *           examples:
 *             revoke_doctor:
 *               summary: Thu hồi quyền của bác sĩ
 *               value:
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *     responses:
 *       200:
 *         description: Thu hồi quyền thành công
 *       400:
 *         description: Grant không tồn tại
 *       403:
 *         description: Không phải bệnh nhân
 */
Router.post('/revoke', authorizeRoles('PATIENT'), accessControlController.revokeAccess);

/**
 * @swagger
 * /v1/access-control/check:
 *   post:
 *     summary: Kiểm tra quyền truy cập
 *     description: |
 *       Kiểm tra xem một địa chỉ ví có quyền truy cập dữ liệu của bệnh nhân ở mức yêu cầu không.
 *       Backend gọi AccessControl.checkAccessLevel(patient, accessor, requiredLevel) on-chain.
 *       EMERGENCY: bác sĩ ACTIVE có quyền mặc định trong tình huống khẩn cấp.
 *     tags: [Access Control]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CheckAccessRequest'
 *           examples:
 *             check_full_access:
 *               summary: Kiểm tra quyền FULL
 *               value:
 *                 patientAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 requiredLevel: "FULL"
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra quyền
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasAccess:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Lỗi dữ liệu
 */
Router.post('/check', accessControlController.checkAccess);

/**
 * @swagger
 * /v1/access-control/grant-info:
 *   post:
 *     summary: Lấy thông tin quyền truy cập
 *     description: |
 *       Lấy thông tin chi tiết về quyền truy cập giữa bệnh nhân và bác sĩ/lab tech.
 *       Backend gọi AccessControl.getAccessGrant(patient, accessor) on-chain.
 *     tags: [Access Control]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientAddress
 *               - accessorAddress
 *             properties:
 *               patientAddress:
 *                 type: string
 *                 example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *               accessorAddress:
 *                 type: string
 *                 example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *           examples:
 *             get_grant_info:
 *               summary: Lấy thông tin quyền
 *               value:
 *                 patientAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 accessorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *     responses:
 *       200:
 *         description: Thông tin quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 level:
 *                   type: number
 *                   description: "Mức quyền: 0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE"
 *                   example: 2
 *                 grantedAt:
 *                   type: number
 *                   description: Thời điểm cấp quyền (Unix timestamp)
 *                   example: 1711500000
 *                 expiresAt:
 *                   type: number
 *                   description: "Thời điểm hết hạn (Unix timestamp), 0 = vĩnh viễn"
 *                   example: 1712104800
 *                 isActive:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Lỗi dữ liệu
 */
Router.post('/grant-info', accessControlController.getAccessGrant);

/**
 * @swagger
 * /v1/access-control/my-grants:
 *   get:
 *     summary: Xem danh sách những người đã được cấp quyền truy cập (Feature 2)
 *     description: |
 *       Bệnh nhân xem tất cả những người (bác sĩ, lab tech) đã được cấp quyền truy cập hồ sơ y tế của mình.
 *       - Query từ blockchain events (AccessGranted, AccessRevoked) để lấy danh sách.
 *       - Chỉ hiển thị grant đang ACTIVE (not revoked + not expired).
 *       - Sắp xếp theo thời gian cấp gần nhất (mới nhất trước).
 *       - Hỗ trợ phân trang (page, limit).
 *     tags: [Access Control]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang (bắt đầu từ 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Số lượng grant trên một trang
 *     responses:
 *       200:
 *         description: Danh sách grant của bệnh nhân
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Lấy danh sách quyền truy cập thành công"
 *                 grants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       accessor:
 *                         type: string
 *                         description: Địa chỉ ví người được cấp quyền
 *                         example: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
 *                       level:
 *                         type: number
 *                         description: "Mức quyền: 2=FULL, 3=SENSITIVE"
 *                         example: 2
 *                       levelName:
 *                         type: string
 *                         enum: [FULL, SENSITIVE]
 *                         example: "FULL"
 *                       grantedAt:
 *                         type: number
 *                         description: Unix timestamp khi cấp quyền
 *                         example: 1711500000
 *                       expiresAt:
 *                         type: number
 *                         description: "Unix timestamp hết hạn (0 = vĩnh viễn)"
 *                         example: 0
 *                       isExpired:
 *                         type: boolean
 *                         example: false
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     total:
 *                       type: integer
 *                       description: Tổng số grant đang active
 *                       example: 3
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *       401:
 *         description: Không xác thực
 *       400:
 *         description: Lỗi lấy danh sách
 */
Router.get('/my-grants', authorizeRoles('PATIENT'), accessControlController.getMyGrants);

export const accessControlRoute = Router;
