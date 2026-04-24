import express from 'express';
import { authRoute } from '~/routes/v1/auth.route';
import { adminRoute } from '~/routes/v1/admin.route';
import { adminAuthRoute } from './adminAuth.route';
import { patientRoute } from '~/routes/v1/patient.route';
import { labTechRoute } from '~/routes/v1/labTech.route';
import { doctorRoute } from '~/routes/v1/doctor.route';
const Router = express.Router();

// Auth API
Router.use('/auth', authRoute);

// Admin auth api (api login riêng dành cho admin)
Router.use('/admins/auth', adminAuthRoute);

// Admin API
Router.use('/admins', adminRoute);

// Patient API
Router.use('/patients', patientRoute);

// Lab Tech API
Router.use('/lab-techs', labTechRoute);

// Doctor API
Router.use('/doctors', doctorRoute);

export const APIs_V1 = Router;
