import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { medicalRecordValidation } from '~/validations/medicalRecord.validation';
import { testResultController } from '~/controllers/testResult.Controller';
import { patientController } from '~/controllers/patient.controller';
import { doctorController } from '~/controllers/doctor.controller';

const Router = express.Router();

// Tất cả route /doctor/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('DOCTOR'));

Router
    // Api lấy chi tiết hồ sơ bệnh án
    .get(
        '/medical-records/:medicalRecordId',
        medicalRecordValidation.medicalRecordId,
        medicalRecordController.getDetail,
    )
    // Api lấy tất cả hồ sơ bệnh án
    .get('/medical-records', medicalRecordController.getAll)
    // Api lấy chi tiết kết quả xét nghiệm
    .get('/test-results/:testResultId', testResultController.getDetail)
    // Api lấy tất cả kết quả xét nghiệm
    .get('/test-results', testResultController.getAll)
    // APi lấy danh sách tất cả bệnh nhân
    .get('/patients', patientController.getAll)
    // Api lây chi tiết bệnh nhân
    .get('/patients/:patientId', patientController.getPatientById)
    // Api tạo hồ sơ bệnh án(ban đầu) cho 1 bệnh nhân
    .post('/patients/:patientId/medical-records', medicalRecordValidation.createNew, medicalRecordController.createNew)
    // Api chẩn đoán cuối cùng hồ sơ bệnh án
    .patch(
        '/medical-records/:medicalRecordId/diagnosis',
        medicalRecordValidation.diagnosis,
        medicalRecordController.diagnosis,
    )
    // Api lấy thông tin bản thân
    .get('/me', doctorController.getMyProfile);
export const doctorRoute = Router;
