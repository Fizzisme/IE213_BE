import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { patientValidation } from '~/validations/patient.validation';
import { patientController } from '~/controllers/patient.controller';

const Router = express.Router();
// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
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
 * v1/patients:
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
Router.post('/', patientValidation.createPatient, patientController.createPatient);

export const patientRoute = Router;
