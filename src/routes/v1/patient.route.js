import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { patientValidation } from '~/validations/patient.validation';
import { patientController } from '~/controllers/patient.controller';

const Router = express.Router();
// Tất cả route /patients/* đều phải qua verifyToken + require PATIENT role
Router.use(verifyToken, authorizeRoles('PATIENT'));

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
 *           example: 946684800000
 */

/**
 * @swagger
 * /v1/patients:
 *   post:
 *     summary: Tạo thông tin bệnh nhân mới
 *     tags: [Patient]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePatientRequest'
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
Router.post('/', patientValidation.createPatient, patientController.createPatient)
    /**
     * @swagger
     * /v1/patients/me:
     *   get:
     *     summary: Lấy thông tin hồ sơ bệnh nhân của chính người dùng
     *     tags: [Patient]
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
     *                     id:
     *                       type: string
     *                       example: "69ba902193958774013b93e9"
     *                     userId:
     *                       type: string
     *                       example: "69b8ebdde2fbbfead81f3502"
     *                     fullName:
     *                       type: string
     *                       example: "Nguyễn Văn A"
     *                     gender:
     *                       type: string
     *                       enum: [M, F]
     *                       example: "M"
     *                     birthYear:
     *                       type: number
     *                       example: 2000
     *                     phoneNumber:
     *                       type: string
     *                       example: "0912345678"
     *                     createdAt:
     *                       type: string
     *                       example: "2026-03-18T11:44:33.337Z"
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Không tìm thấy hồ sơ bệnh nhân
     *       500:
     *         description: Lỗi server
     */
    .get('/me', patientController.getMyProfile);

/**
 * @swagger
 * /v1/patients/me/register-blockchain:
 *   post:
 *     summary: Patient tự chuẩn bị giao dịch registerPatient() để ký bằng MetaMask
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Trả về transaction request cho hàm `registerPatient()` của AccountManager.
 *       Vì hàm này dùng `msg.sender`, transaction phải được ký bởi chính ví của patient.
 *     responses:
 *       200:
 *         description: Chuẩn bị giao dịch thành công
 *       400:
 *         description: Patient chưa có wallet hợp lệ
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Không phải PATIENT
 */
Router.post('/me/register-blockchain', patientController.prepareRegisterBlockchain);

/**
 * @swagger
 * /v1/patients/me/register-blockchain/confirm:
 *   post:
 *     summary: Patient xác nhận txHash sau khi ký registerPatient() bằng MetaMask
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
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0xabc123def456..."
 *     responses:
 *       200:
 *         description: Patient registered on blockchain successfully
 *       400:
 *         description: txHash hoặc function call không hợp lệ
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tx không thuộc wallet của patient hiện tại
 *       404:
 *         description: Không tìm thấy transaction data
 *       409:
 *         description: Transaction chưa được confirm on-chain
 */
Router.post(
    '/me/register-blockchain/confirm',
    patientValidation.confirmRegisterBlockchain,
    patientController.confirmRegisterBlockchain,
);

export const patientRoute = Router;
