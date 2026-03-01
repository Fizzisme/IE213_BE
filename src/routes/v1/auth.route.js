import express from 'express';
import { authController } from '~/controllers/auth.controller';
import { authValidation } from '~/validations/auth.validation';

const Router = express.Router();

/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Register new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               fullName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               nationId:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */
Router.post('/register', authValidation.register, authController.register);

//login
Router.post('/login/nationId', authValidation.loginByNationId, authController.loginByNationId);
Router.post('/login/wallet', authController.loginByWallet);

export const authRoute = Router;
