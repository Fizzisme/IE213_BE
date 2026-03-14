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

// /**
//  * @swagger
//  * /v1/auth/create_patient:
//  *   post:
//  *     summary: create new patient
//  *     tags: [Auth]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               fullName:
//  *                 type: string
//  *               gender:
//  *                 type: Enum['M','F']
//  *               dob:
//  *                  type: number
//  *               phoneNumber:
//  *                  type: string
//  *     responses:
//  *       204:
//  *         description: Success
//  */
// /**
//  * @swagger
//  * /v1/auth/register:
//  *   post:
//  *     summary: Register new patient (role auto-set to PATIENT)
//  *     tags: [Auth]
//  *     description: |
//  *       Create new patient account in PENDING status awaiting admin approval.
//  *       NOTE: role field is NOT accepted. All new users automatically become PATIENT.
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - nationId
//  *               - password
//  *               - phoneNumber
//  *               - fullName
//  *               - email
//  *               - dob
//  *             properties:
//  *               nationId:
//  *                 type: string
//  *                 example: '012345678901'
//  *                 description: CCCD/CMND (9 or 12 digits, must be unique)
//  *               password:
//  *                 type: string
//  *                 minLength: 8
//  *               phoneNumber:
//  *                 type: string
//  *                 example: '0901234567'
//  *                 description: Vietnam format (must be unique)
//  *               fullName:
//  *                 type: string
//  *               email:
//  *                 type: string
//  *                 format: email
//  *               gender:
//  *                 type: string
//  *                 enum: ['M', 'F']
//  *               dob:
//  *                 type: number
//  *                 example: 2000
//  *     responses:
//  *       201:
//  *         description: Registration successful. Status = PENDING
//  *       406:
//  *         description: User with this nationId already exists
//  */
// Router.post('/register', authValidation.register, authController.register);

/**
 * @swagger
 * /v1/auth/login/nationId:
 *   post:
 *     summary: Login with CCCD/CMND and password
 *     tags: [Auth]
 *     description: Admin users should use POST /v1/admin/auth/login instead.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nationId
 *               - password
 *             properties:
 *               nationId:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Login successful. Tokens in HTTP-only cookies
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account pending, rejected, or inactive
 */
Router.post('/login/nationId', authValidation.loginByNationId, authController.loginByNationId);

/**
 * @swagger
 * /v1/auth/login/wallet:
 *   post:
 *     summary: Wallet login (2-phase)
 *     tags: [Auth]
 *     description: Phase 1 - send walletAddress only to get nonce; Phase 2 - send walletAddress + signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 type: string
 *               signature:
 *                 type: string
 *                 description: Required only in Phase 2
 *     responses:
 *       200:
 *         description: Phase 1 returns nonce; Phase 2 returns tokens
 */
Router.post('/login/wallet', authController.loginByWallet);

export const authRoute = Router;
