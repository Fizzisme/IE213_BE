import express from 'express';
import { userRoute } from '~/routes/v1/user.route';
import { authRoute } from '~/routes/v1/auth.route';
import { adminUserRoute } from '~/routes/v1/adminUser.route';
import { adminAuthRoute } from './adminAuth.route';
const Router = express.Router();

// Auth API
Router.use('/auth', authRoute);
// User API
Router.use('/user', userRoute);

// Admin auth api (api login riêng dành cho admin)
Router.use('/admin/auth', adminAuthRoute);

// Admin API
Router.use('/admin', adminUserRoute);
export const APIs_V1 = Router;
