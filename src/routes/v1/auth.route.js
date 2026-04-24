import express from 'express';
import { authController } from '~/controllers/auth.controller';
import { authValidation } from '~/validations/auth.validation';
import { authMiddleware } from '~/middlewares/authMiddleware';
import { verifyToken } from '~/middlewares/verifyToken';

const Router = express.Router();

Router
    // Api user đăng ký
    .post('/register', authValidation.register, authController.register)
    // Api
    .post('/login/nationId', authValidation.loginByNationId, authController.loginByNationId)
    // Api đăng nhập qua ví
    .post('/login/wallet', authController.loginByWallet)
    // Api đăng xuất
    .delete('/logout', authController.logout)
    .get('/me', verifyToken, authController.getMe);

export const authRoute = Router;
