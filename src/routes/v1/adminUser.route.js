// src/routes/v1/adminUser.route.js
import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { adminUserValidation } from '~/validations/adminUser.validation';
import { adminUserController } from '~/controllers/adminUser.controller';

const Router = express.Router();
