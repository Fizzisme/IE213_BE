import express from 'express';

const Router = express.Router();

// only Patient
Router.route('/patient');

// only Doctor
Router.route('/doctor');

// only Admin
Router.route('/admin');

export const userRoute = Router;
