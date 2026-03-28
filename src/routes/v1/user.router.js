import express from 'express';
import { userController } from '~/controllers/user.controller';
import { authMiddleware } from '~/middlewares/authMiddleware';
const Router = express.Router();

Router.route('/me').get(authMiddleware.isAuthorized, userController.getMe);

export const userRoute = Router;
