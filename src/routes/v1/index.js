import express from 'express';
import { userRoute } from '~/routes/v1/user.route';
import { authRoute } from '~/routes/v1/auth.route';

const Router = express.Router();

// Auth API
Router.use('/auth', authRoute);
// User API
Router.use('/user', userRoute);
export const APIs_V1 = Router;
