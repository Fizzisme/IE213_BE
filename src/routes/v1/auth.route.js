import express from 'express';
import { authController } from '~/controllers/auth.controller';
import { authValidation } from '~/validations/auth.validation';
import { authMiddleware } from '~/middlewares/authMiddleware';

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
 *               nationId:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */
Router.post('/register', authValidation.register, authController.register);

/**
 * @swagger
 * /v1/auth/create_patient:
 *   post:
 *     summary: create new patient
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               gender:
 *                 type: Enum['M','F']
 *               dob:
 *                  type: number
 *               phoneNumber:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */
Router.post('/create_patient', authMiddleware.isAuthorized, authValidation.createPatient, authController.createPatient);

/**
 * @swagger
 * /v1/auth/login/nationId:
 *   post:
 *     summary: create new patient
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nationId:
 *                 type: string
 *               password:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */
Router.post('/login/nationId', authValidation.loginByNationId, authController.loginByNationId);
/**
 * @swagger
 * /v1/auth//login/wallet:
 *   post:
 *     summary: create new patient
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletAddress:
 *                 type: string
 *               signature:
 *                  type: string
 *     responses:
 *       204:
 *         description: Success
 */
Router.post('/login/wallet', authController.loginByWallet);

export const authRoute = Router;
