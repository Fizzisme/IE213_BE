import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { patientValidation } from '~/validations/patient.validation';
import { patientController } from '~/controllers/patient.controller';
import { appointmentController } from '~/controllers/appointment.controller';
import { serviceController } from '~/controllers/service.controller';
import { notificationController } from '~/controllers/notification.controller';
const Router = express.Router();
// Tất cả route /admin/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('PATIENT'));

Router.post('/', patientValidation.createPatient, patientController.createPatient)
    .get('/me', patientController.getMyProfile)
    .post('/appointments', appointmentController.createAppointment)
    .get('/appointments/me', appointmentController.getMyAppointments)
    .get('/services', serviceController.getAllServices)
    .patch('/appointments/:id/cancel', appointmentController.cancelMyAppointment)
    .patch('/appointments/:id/reschedule', appointmentController.rescheduleMyAppointment)
    .get('/notifications/me', notificationController.getNotifications)
    .patch('/notifications/:notificationId/read', notificationController.markAsRead)
    .patch('/notifications/read-all', notificationController.markAllAsRead)
    .get('/notifications/unread/count/:userId', notificationController.getUnreadCount)
    .delete('/notifications/delete-all', notificationController.deleteAllNotifications)
    .delete('/notifications/:notificationId', notificationController.deleteNotification);

export const patientRoute = Router;
