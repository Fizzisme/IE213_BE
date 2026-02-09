import express, { json } from 'express';
import { authController } from '~/controllers/authController';
import { authValidation } from '~/validations/authValidation';

const Router = express.Router();

// register
Router.post('/register', authValidation, authController.register);

//login
Router.post('/login/phone');
Router.post('/login/wallet', authController.loginByWallet);

export const authRoute = Router;
