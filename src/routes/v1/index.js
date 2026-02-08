import express from 'express';
import { userRoute } from '~/routes/v1/userRoute';

const Router = express.Router();

// user api
Router.use('/user', userRoute);
export const APIs_V1 = Router;
