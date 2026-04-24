import express from 'express';
import { authRoute } from '~/routes/v1/auth.route';
import { userRoute } from '~/routes/v1/user.route';
import { adminUserRoute } from '~/routes/v1/adminUser.route';
import { adminAuthRoute } from './adminAuth.route';
import { patientRoute } from '~/routes/v1/patient.route';
import { doctorRoute } from '~/routes/v1/doctor.route';
import { blockchainRoute } from '~/routes/v1/blockchain.route';
import { labOrderRoute } from '~/routes/v1/labOrder.route';
import { accessControlRoute } from '~/routes/v1/accessControl.route';
import { patientRecordRoute } from '~/routes/v1/patientRecord.route';
import { labTechRoute } from '~/routes/v1/labTech.route';
const Router = express.Router();

// Auth API
Router.use('/auth', authRoute);

// User Profile API
Router.use('/users', userRoute);

// Admin auth api (api login riêng dành cho admin)
Router.use('/admins/auth', adminAuthRoute);

// Admin API - ✅ [CRITICAL FIX #3] Consolidated to use adminUserRoute (removed duplicate adminRoute)
Router.use('/admins', adminUserRoute);

// Patient API
Router.use('/patients', patientRoute);

// Doctor API
Router.use('/doctors', doctorRoute);

// Lab Tech API
Router.use('/lab-techs', labTechRoute);

// LabOrder API
Router.use('/lab-orders', labOrderRoute);

// Access Control API
Router.use('/access-control', accessControlRoute);

// Patient Records API
Router.use('/patient-records', patientRecordRoute);

// Blockchain API
Router.use('/blockchain', blockchainRoute);

export const APIs_V1 = Router;
