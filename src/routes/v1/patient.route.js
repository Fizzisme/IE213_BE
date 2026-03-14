import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { patientValidation } from '~/validations/patient.validation';
import { patientController } from '~/controllers/patient.controller';

const Router = express.Router();
// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('PATIENT'));

Router.post('/', patientValidation.createPatient, patientController.createPatient);

export const patientRoute = Router;
