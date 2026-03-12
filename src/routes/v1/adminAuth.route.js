import express from 'express';
import { adminAuthController } from '~/controllers/adminAuth.controller';
import { adminAuthValidation } from '~/validations/adminAuth.validation';

const Router = express.Router();

// POST /v1/admin/auth/login
Router.post('/login', adminAuthValidation.login, adminAuthController.login);

export const adminAuthRoute = Router;