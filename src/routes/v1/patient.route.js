import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import { patientValidation } from '~/validations/patient.validation';
import { patientController } from '~/controllers/patient.controller';
import { appointmentController } from '~/controllers/appointment.controller';
import { serviceController } from '~/controllers/service.controller';
import { notificationController } from '~/controllers/notification.controller';
import { chainCheck } from '~/middlewares/chainCheck';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { medicalRecordValidation } from '~/validations/medicalRecord.validation';

const Router = express.Router();

// Tất cả route /patients/* đều phải qua verifyToken + requirePatient
Router.use(verifyToken, authorizeRoles('PATIENT'));

Router.post('/', patientValidation.createPatient, patientController.createPatient);
Router.get('/me', patientController.getMyProfile);
Router.post('/appointments', appointmentController.createAppointment);
Router.get('/appointments/me', appointmentController.getMyAppointments);
Router.get('/services', serviceController.getAllServices);
Router.patch('/appointments/:id/cancel', appointmentController.cancelMyAppointment);
Router.patch('/appointments/:id/reschedule', appointmentController.rescheduleMyAppointment);
Router.get('/medical-records', medicalRecordController.getMyMedicalRecords);
Router.get(
    '/medical-records/:medicalRecordId',
    medicalRecordValidation.medicalRecordId,
    medicalRecordController.getMyMedicalRecordDetail,
);

// Api cấp quyền cho bác sĩ trên Blockchain
Router.get('/appointments/:id/prepare-grant-access', appointmentController.prepareGrantAccess);
Router.get('/appointments/:id/prepare-revoke-access', appointmentController.prepareRevokeAccess);
Router.post('/appointments/:id/verify-revoke-access', chainCheck, appointmentController.verifyRevokeAccess);
Router.post('/appointments/:id/verify-grant-access', chainCheck, appointmentController.verifyGrantAccess);
Router.get('/notifications/me', notificationController.getNotifications);
Router.patch('/notifications/:notificationId/read', notificationController.markAsRead);
Router.patch('/notifications/read-all', notificationController.markAllAsRead);
Router.get('/notifications/unread/count/:userId', notificationController.getUnreadCount);
Router.delete('/notifications/delete-all', notificationController.deleteAllNotifications);
Router.delete('/notifications/:notificationId', notificationController.deleteNotification);

export const patientRoute = Router;
