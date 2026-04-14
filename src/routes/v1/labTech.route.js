import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { testResultController } from '~/controllers/testResult.Controller';
import { testResultValidation } from '~/validations/testResult.validation';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { labTechController } from '~/controllers/labTech.controller';

const Router = express.Router();

// Tất cả route /lab-tech/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('LAB_TECH'));

Router
    /**
     * @swagger
     * v1/lab-tech/test-results:
     *   get:
     *     summary: Lấy danh sách kết quả xét nghiệm
     *     tags: [Lab Tech]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Lấy danh sách thành công
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .get('/test-results', testResultController.getAll)
    /**
     * @swagger
     * v1/lab-tech//medical-records/:medicalRecordId/test-results:
     *   post:
     *     summary: Lab Tech tạo kết quả xét nghiệm
     *     tags: [Lab Tech]
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
     *               - medicalRecordId
     *               - testType
     *               - rawData
     *             properties:
     *               medicalRecordId:
     *                 type: string
     *                 example: "64f1a2b3c4d5e6f789012999"
     *               testType:
     *                 type: string
     *                 enum: [DIABETES_TEST]
     *                 example: "DIABETES_TEST"
     *               rawData:
     *                 type: object
     *                 description: "Dữ liệu xét nghiệm thô (linh hoạt theo từng loại test)"
     *                 example:
     *                   glucose: 140
     *                   insulin: 18
     *                   bmi: 25.6
     *                   age: 45
     *     responses:
     *       201:
     *         description: Tạo kết quả xét nghiệm thành công
     *       400:
     *         description: Dữ liệu không hợp lệ
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    .post(
        '/medical-records/:medicalRecordId/test-results',
        testResultValidation.createNew,
        testResultController.createNew,
    )
    .get('/medical-records', medicalRecordController.getAll)
    .get('/me', labTechController.getMyProfile);

export const labTechRoute = Router;
