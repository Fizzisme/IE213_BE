import express from 'express';
import { userRoute } from '~/routes/v1/userRoute';
import { authRoute } from '~/routes/v1/authRoute';

const Router = express.Router();

// auth api
Router.use('/auth', authRoute);
// user api
Router.use('/user', userRoute);
export const APIs_V1 = Router;
