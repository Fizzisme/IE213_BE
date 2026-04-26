import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { testResultController } from '~/controllers/testResult.Controller';
import { testResultValidation } from '~/validations/testResult.validation';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { labTechController } from '~/controllers/labTech.controller';
import { chainCheck } from '~/middlewares/chainCheck';

const Router = express.Router();

// Tất cả route /lab-tech/* đều phải qua verifyToken + requireLabTech
Router.use(verifyToken, authorizeRoles('LAB_TECH'));

// Api lấy tất cả kết quả xét nghiệm
Router.get('/test-results', testResultController.getAll);
// Api tạo kết quả xét nghiệm cho 1 hồ sơ bệnh án
Router.post(
    '/medical-records/:medicalRecordId/test-results',
    testResultValidation.createNew,
    testResultController.createNew,
);
// Api xác minh giao dịch Blockchain sau khi ký MetaMask
Router.post('/test-results/:testResultId/verify-tx', chainCheck, testResultController.verifyTx);
// Api lấy tất cả hồ sơ bệnh án
Router.get('/medical-records', medicalRecordController.getAll);
// APi lấy thông tin bản thân
Router.get('/me', labTechController.getMyProfile);

export const labTechRoute = Router;
