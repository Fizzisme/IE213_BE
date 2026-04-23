import express from 'express';
import { blockchainController } from '~/controllers/blockchain.controller';
import { blockchainEventSyncController } from '~/controllers/blockchainEventSync.controller';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';

const Router = express.Router();

/**
 * @swagger
 * /v1/blockchain/health:
 *   get:
 *     summary: Blockchain readiness health check
 *     description: |
 *       Kiểm tra tình trạng sẵn sàng của hạ tầng blockchain.
 *       Bao gồm: kết nối RPC, trạng thái deploy contract, ABI compatibility, quyền admin, wiring giữa các contract.
 *     tags: [Blockchain]
 *     responses:
 *       200:
 *         description: Blockchain infrastructure is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ready"
 *                 network:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "sepolia"
 *                     chainId:
 *                       type: number
 *                       example: 11155111
 *                     blockNumber:
 *                       type: number
 *                       example: 5123456
 *                 contracts:
 *                   type: object
 *                   properties:
 *                     accountManager:
 *                       type: string
 *                       example: "0x..."
 *                     accessControl:
 *                       type: string
 *                       example: "0x..."
 *                     ehrManager:
 *                       type: string
 *                       example: "0x..."
 *       503:
 *         description: Blockchain infrastructure is not ready
 */
Router.get('/health', blockchainController.health);

/**
 * @swagger
 * /v1/blockchain/audit-logs:
 *   get:
 *     summary: Lấy tất cả audit logs (Admin only)
 *     description: |
 *       Lấy danh sách tất cả audit logs trong hệ thống, bao gồm cả on-chain và off-chain events.
 *       Phân trang với page và limit.
 *     tags: [Blockchain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Trang hiện tại
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *         description: Số lượng logs mỗi trang
 *         example: 50
 *     responses:
 *       200:
 *         description: Danh sách audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       walletAddress:
 *                         type: string
 *                         example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                       action:
 *                         type: string
 *                         example: "RECORD_ADDED_ON_CHAIN"
 *                       entityType:
 *                         type: string
 *                         example: "LAB_ORDER"
 *                       entityId:
 *                         type: string
 *                         example: "1"
 *                       txHash:
 *                         type: string
 *                         example: "0xabc123..."
 *                       status:
 *                         type: string
 *                         example: "SUCCESS"
 *                       details:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         example: "2026-03-29T10:00:00.000Z"
 *                 total:
 *                   type: number
 *                   example: 150
 *                 page:
 *                   type: number
 *                   example: 1
 *                 limit:
 *                   type: number
 *                   example: 50
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Không phải admin
 */
Router.get('/audit-logs', verifyToken, authorizeRoles('ADMIN'), blockchainEventSyncController.getAllAuditLogs);

/**
 * @swagger
 * /v1/blockchain/audit-logs/entity/{entityType}/{entityId}:
 *   get:
 *     summary: Lấy audit logs theo entity
 *     description: |
 *       Lấy tất cả audit logs liên quan đến một entity cụ thể (lab order, user, access control).
 *       Dùng để xem lịch sử thay đổi của một record cụ thể.
 *     tags: [Blockchain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [LAB_ORDER, USER, ACCESS_CONTROL, PATIENT]
 *         description: Loại entity
 *         example: "LAB_ORDER"
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của entity (blockchain recordId hoặc MongoDB ObjectId)
 *         example: "1"
 *     responses:
 *       200:
 *         description: Danh sách audit logs của entity
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: Unauthorized
 */
Router.get('/audit-logs/entity/:entityType/:entityId', verifyToken, blockchainEventSyncController.getAuditLogs);

/**
 * @swagger
 * /v1/blockchain/audit-logs/me:
 *   get:
 *     summary: Lấy audit logs của chính mình
 *     description: |
 *       Lấy tất cả audit logs liên quan đến tài khoản của người dùng đang đăng nhập.
 *       Bao gồm: đăng nhập, cấp quyền, tạo order, xem hồ sơ, v.v.
 *     tags: [Blockchain]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách audit logs của user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   action:
 *                     type: string
 *                     example: "CONSENT_LAB_ORDER"
 *                   entityType:
 *                     type: string
 *                     example: "LAB_ORDER"
 *                   txHash:
 *                     type: string
 *                     example: "0xabc123..."
 *                   status:
 *                     type: string
 *                     example: "SUCCESS"
 *                   createdAt:
 *                     type: string
 *                     example: "2026-03-29T10:00:00.000Z"
 *       401:
 *         description: Unauthorized
 */
Router.get('/audit-logs/me', verifyToken, blockchainEventSyncController.getAuditLogsByUser);

/**
 * @swagger
 * /v1/blockchain/audit-logs/my-access-history:
 *   get:
 *     summary: 🆕 Bệnh nhân xem ai đã truy cập dữ liệu của họ (Feature 1)
 *     description: |
 *       Bệnh nhân xem toàn bộ audit log của các hành động liên quan tới dữ liệu của họ:
 *       - GRANT_ACCESS: Ai được cấp quyền
 *       - UPDATE_ACCESS: Quyền được sửa
 *       - REVOKE_ACCESS: Quyền bị thu hồi
 *       - CREATE_LAB_ORDER: Ai tạo order
 *       - CONSENT_LAB_ORDER: Đã xác nhận/từ chối
 *       - POST_LAB_RESULT: Kết quả được post
 *       - ADD_CLINICAL_INTERPRETATION: Diễn giải được thêm
 *       
 *       Dashboard giúp bệnh nhân theõ dõi tất cả truy cập & thay đổi dữ liệu của họ.
 *     tags: [Blockchain, Patient Access Control]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Số items mỗi trang (mặc định 50)
 *     responses:
 *       200:
 *         description: Danh sách audit log của bệnh nhân
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                         example: "GRANT_ACCESS"
 *                       walletAddress:
 *                         type: string
 *                         example: "0xAbc..."
 *                       status:
 *                         type: string
 *                         example: "SUCCESS"
 *                       createdAt:
 *                         type: string
 *                         example: "2026-04-07T10:30:00Z"
 *                       txHash:
 *                         type: string
 *                         example: "0x123abc..."
 *                 total:
 *                   type: number
 *                   example: 25
 *                 page:
 *                   type: number
 *                   example: 1
 *                 limit:
 *                   type: number
 *                   example: 50
 *                 summary:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                       example: "All access and modification logs related to your data"
 *                     actions:
 *                       type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Patient role required
 */
Router.get('/audit-logs/my-access-history', verifyToken, authorizeRoles('PATIENT'), blockchainEventSyncController.getMyAccessAuditLog);

export const blockchainRoute = Router;
