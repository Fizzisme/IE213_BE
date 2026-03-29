import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { medicalRecordValidation } from '~/validations/medicalRecord.validation';
import { testResultController } from '~/controllers/testResult.Controller';
import { patientController } from '~/controllers/patient.controller';

const Router = express.Router();

// Tất cả route /doctor/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('DOCTOR'));

Router
    /**
     * @swagger
     * v1/doctors/medical-records/{medicalRecordId}:
     *   get:
     *     summary: Lấy chi tiết hồ sơ bệnh án
     *     tags: [DOCTOR]
     *     parameters:
     *       - in: path
     *         name: medicalRecordId
     *         required: true
     *         description: ID của hồ sơ bệnh án (MongoDB ObjectId)
     *         schema:
     *           type: string
     *           pattern: '^[0-9a-fA-F]{24}$'
     *     responses:
     *       200:
     *         description: Thành công
     *       422:
     *         description: Validation error
     *       404:
     *         description: Không tìm thấy
     */
    .get(
        '/medical-records/:medicalRecordId',
        medicalRecordValidation.medicalRecordId,
        medicalRecordController.getDetail,
    )
    /**
     * @swagger
     * v1/doctors/medical-records:
     *   get:
     *     summary: Lấy danh sách hồ sơ bệnh án (có thể filter theo status)
     *     tags: [DOCTOR]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: status
     *         required: false
     *         schema:
     *           type: string
     *         description: "Filter theo trạng thái, có thể truyền nhiều giá trị, ví dụ: CREATED,HAS_RESULT"
     *         example: "CREATED,HAS_RESULT"
     *     responses:
     *       200:
     *         description: Lấy danh sách hồ sơ bệnh án thành công
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
     *                         example: "69ba902193958774013b93e9"
     *                       patientId:
     *                         type: string
     *                         example: "69b8e99ec5252c2810cda964"
     *                       type:
     *                         type: string
     *                         example: "DIABETES_TEST"
     *                       status:
     *                         type: string
     *                         example: "CREATED"
     *                       note:
     *                         type: string
     *                         example: "Test"
     *                       createdAt:
     *                         type: string
     *                         example: "2026-03-18T11:44:33.337Z"
     *       400:
     *         description: Query không hợp lệ
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .get('/medical-records', medicalRecordController.getAll)
    /**
     * @swagger
     * v1/doctors/test-results/{testResultId}:
     *   get:
     *     summary: Lấy chi tiết kết quả xét nghiệm
     *     tags: [DOCTOR]
     *     parameters:
     *       - in: path
     *         name: testResultId
     *         required: true
     *         description: ID kết quả xét nghiệm (MongoDB ObjectId)
     *         schema:
     *           type: string
     *           pattern: '^[0-9a-fA-F]{24}$'
     *     responses:
     *       200:
     *         description: Lấy thành công
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 statusCode:
     *                   type: integer
     *                   example: 200
     *                 message:
     *                   type: string
     *                   example: Success
     *                 data:
     *                   type: object
     *                   properties:
     *                     _id:
     *                       type: string
     *                       example: 65f1a2b3c4d5e6f789012345
     *                     medicalRecordId:
     *                       type: string
     *                       example: 65f1a2b3c4d5e6f789012345
     *                     result:
     *                       type: string
     *                       example: Positive
     *                     note:
     *                       type: string
     *                       example: Ghi chú kết quả
     *                     createdAt:
     *                       type: string
     *                       format: date-time
     *       422:
     *         description: Validation error
     *       404:
     *         description: Không tìm thấy
     */
    .get('/test-results/:testResultId', testResultController.getDetail)
    /**
     * @swagger
     * v1/doctors/test-results:
     *   get:
     *     summary: Lấy danh sách kết quả xét nghiệm
     *     tags: [DOCTOR]
     *     responses:
     *       200:
     *         description: Lấy danh sách thành công
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 statusCode:
     *                   type: integer
     *                   example: 200
     *                 message:
     *                   type: string
     *                   example: Success
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       _id:
     *                         type: string
     *                         example: 65f1a2b3c4d5e6f789012345
     *                       medicalRecordId:
     *                         type: string
     *                         example: 65f1a2b3c4d5e6f789012345
     *                       result:
     *                         type: string
     *                         example: Positive
     *                       note:
     *                         type: string
     *                         example: Ghi chú kết quả
     *                       createdAt:
     *                         type: string
     *                         format: date-time
     *       500:
     *         description: Lỗi server
     */
    .get('/test-results', testResultController.getAll)
    /**
     * @swagger
     * v1/doctors/patients:
     *   get:
     *     summary: Lấy danh sách tất cả bệnh nhân
     *     tags: [DOCTOR]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         required: false
     *         schema:
     *           type: number
     *         example: 1
     *       - in: query
     *         name: limit
     *         required: false
     *         schema:
     *           type: number
     *         example: 10
     *     responses:
     *       200:
     *         description: Lấy danh sách bệnh nhân thành công
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
     *                         example: "69ba902193958774013b93e9"
     *                       fullName:
     *                         type: string
     *                         example: "Nguyễn Văn A"
     *                       gender:
     *                         type: string
     *                         enum: [M, F]
     *                         example: "M"
     *                       birthYear:
     *                         type: number
     *                         example: 2000
     *                       phoneNumber:
     *                         type: string
     *                         example: "0912345678"
     *                       createdAt:
     *                         type: string
     *                         example: "2026-03-18T11:44:33.337Z"
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .get('/patients', patientController.getAll)
    /**
     * @swagger
     * v1/doctors/patients/{patientId}:
     *   get:
     *     summary: Lấy thông tin chi tiết bệnh nhân theo ID
     *     tags: [DOCTOR]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - name: patientId
     *         in: path
     *         required: true
     *         schema:
     *           type: string
     *         example: "69ba902193958774013b93e9"
     *     responses:
     *       200:
     *         description: Lấy thông tin bệnh nhân thành công
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
     *       400:
     *         description: ID không hợp lệ
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Không tìm thấy bệnh nhân
     */
    .get('/patients/:patientId', patientController.getPatientById)
    /**
     * @swagger
     * v1/doctors/patients/{patientId}/medical-records:
     *   post:
     *     summary: Doctor tạo hồ sơ bệnh án
     *     tags: [DOCTOR]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - name: patientId
     *         in: path
     *         required: true
     *         schema:
     *           type: string
     *         example: "64f1a2b3c4d5e6f789012345"
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - type
     *             properties:
     *               type:
     *                 type: string
     *                 enum: [DIABETES_TEST]
     *                 example: "DIABETES_TEST"
     *               notes:
     *                 type: string
     *                 maxLength: 500
     *                 example: "Bệnh nhân có dấu hiệu tiểu đường"
     *     responses:
     *       201:
     *         description: Tạo hồ sơ bệnh án thành công
     *       400:
     *         description: Dữ liệu không hợp lệ
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .post('/patients/:patientId/medical-records', medicalRecordValidation.createNew, medicalRecordController.createNew)
    /**
     * @swagger
     * v1/doctors/medical-records/{medicalRecordId}/diagnosis:
     *   patch:
     *     summary: Doctor cập nhật chẩn đoán
     *     tags: [DOCTOR]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - name: medicalRecordId
     *         in: path
     *         required: true
     *         schema:
     *           type: string
     *         example: "64f1a2b3c4d5e6f789012345"
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - testResultId
     *               - diagnosis
     *             properties:
     *               testResultId:
     *                 type: string
     *                 example: "64f1a2b3c4d5e6f789012999"
     *               notes:
     *                 type: string
     *                 maxLength: 500
     *                 example: "Theo dõi thêm"
     *               diagnosis:
     *                 type: string
     *                 minLength: 1
     *                 maxLength: 1000
     *                 example: "Bệnh nhân bị tiểu đường type 2"
     *     responses:
     *       200:
     *         description: Cập nhật chẩn đoán thành công
     *       400:
     *         description: Dữ liệu không hợp lệ
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .patch(
        '/medical-records/:medicalRecordId/diagnosis',
        medicalRecordValidation.diagnosis,
        medicalRecordController.diagnosis,
    );
export const doctorRoute = Router;
