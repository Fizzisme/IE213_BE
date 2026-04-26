import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { medicalRecordValidation } from '~/validations/medicalRecord.validation';
import { testResultController } from '~/controllers/testResult.Controller';
import { patientController } from '~/controllers/patient.controller';
import { doctorController } from '~/controllers/doctor.controller';
import { appointmentController } from '~/controllers/appointment.controller';
import { chainCheck } from '~/middlewares/chainCheck';

const Router = express.Router();

// Tất cả route /doctor/* đều phải qua verifyToken + requireDoctor
Router.use(verifyToken, authorizeRoles('DOCTOR'));

// Api lấy chi tiết hồ sơ bệnh án
Router.get(
    '/medical-records/:medicalRecordId',
    medicalRecordValidation.medicalRecordId,
    medicalRecordController.getDetail,
);
// Api lấy tất cả hồ sơ bệnh án
Router.get('/medical-records', medicalRecordController.getAll);
// Api lấy chi tiết kết quả xét nghiệm
Router.get('/test-results/:testResultId', testResultController.getDetail);
// Api lấy tất cả kết quả xét nghiệm
Router.get('/test-results', testResultController.getAll);
// APi lấy danh sách tất cả bệnh nhân
Router.get('/patients', patientController.getAll);
// Api lây chi tiết bệnh nhân
Router.get('/patients/:patientId', patientController.getPatientById);
// Api tạo hồ sơ bệnh án(ban đầu) cho 1 bệnh nhân
Router.post(
    '/patients/:patientId/medical-records',
    medicalRecordValidation.patientId,
    medicalRecordValidation.createNew,
    medicalRecordController.createNew
);

// Api chẩn đoán cuối cùng hồ sơ bệnh án
Router.patch(
    '/medical-records/:medicalRecordId/diagnosis',
    medicalRecordValidation.diagnosis,
    medicalRecordController.diagnosis,
);
// Api kiểm tra tính toàn vẹn hồ sơ bệnh án với Blockchain
Router.get(
    '/medical-records/:medicalRecordId/verify',
    medicalRecordValidation.medicalRecordId,
    medicalRecordController.verifyIntegrity,
);
// Api xác minh giao dịch Blockchain sau khi ký MetaMask
Router.post(
    '/medical-records/:medicalRecordId/verify-tx',
    chainCheck,
    medicalRecordValidation.medicalRecordId,
    medicalRecordController.verifyTx,
);
// Api lấy thông tin bản thân
Router.get('/me', doctorController.getMyProfile);

export const doctorRoute = Router;
