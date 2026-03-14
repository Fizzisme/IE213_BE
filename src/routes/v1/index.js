import express from 'express';
import { authRoute } from '~/routes/v1/auth.route';
import { adminRoute } from '~/routes/v1/admin.route';
import { adminAuthRoute } from './adminAuth.route';
const Router = express.Router();

// Auth API
Router.use('/auth', authRoute);

// Admin auth api (api login riêng dành cho admin)
Router.use('/admin/auth', adminAuthRoute);

// Admin API
Router.use('/admin', adminRoute);
export const APIs_V1 = Router;
