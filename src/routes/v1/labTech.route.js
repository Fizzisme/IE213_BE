import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';

const Router = express.Router();

// Tất cả route /lab-tech/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('LAB_TECH'));

// 🔴 REMOVED ALL TEST-RESULT ENDPOINTS (thừa vì Lab Order đã chứa test result data)
// Test results được POST qua PATCH /v1/lab-orders/:id/post-result endpoint

export const labTechRoute = Router;
