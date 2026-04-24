import express from 'express';
import { adminAuthController } from '~/controllers/adminAuth.controller';
import { adminAuthValidation } from '~/validations/adminAuth.validation';

const Router = express.Router();

// Api admin đăng nghập
Router.post('/login', adminAuthValidation.login, adminAuthController.login);

export const adminAuthRoute = Router;
