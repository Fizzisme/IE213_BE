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
    // Api lấy tất cả kết quả xét nghiệm
    .get('/test-results', testResultController.getAll)
    // Api tạo kết quả xét nghiệm cho 1 hồ sơ bệnh án
    .post(
        '/medical-records/:medicalRecordId/test-results',
        testResultValidation.createNew,
        testResultController.createNew,
    )
    // Api lấy tất cả hồ sơ bệnh án
    .get('/medical-records', medicalRecordController.getAll)
    // APi lấy thông tin bản thân
    .get('/me', labTechController.getMyProfile);

export const labTechRoute = Router;
