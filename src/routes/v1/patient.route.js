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

// Khởi tạo router của Express
const Router = express.Router();

/**
 * Middleware global cho tất cả route /patients/*
 * - verifyToken: xác thực JWT (đăng nhập)
 * - authorizeRoles('PATIENT'): chỉ cho phép role PATIENT truy cập
 */
Router.use(verifyToken, authorizeRoles('PATIENT'));

/**
 * ==============================
 * PROFILE & PATIENT
 * ==============================
 */

// Tạo thông tin bệnh nhân
Router.post('/', patientValidation.createPatient, patientController.createPatient);

// Lấy thông tin cá nhân của chính mình
Router.get('/me', patientController.getMyProfile);

/**
 * ==============================
 * APPOINTMENTS (Lịch khám)
 * ==============================
 */

// Tạo lịch khám
Router.post('/appointments', appointmentController.createAppointment);

// Lấy danh sách lịch khám của mình
Router.get('/appointments/me', appointmentController.getMyAppointments);

// Hủy lịch khám
Router.patch('/appointments/:id/cancel', appointmentController.cancelMyAppointment);

// Đổi lịch khám
Router.patch('/appointments/:id/reschedule', appointmentController.rescheduleMyAppointment);

/**
 * ==============================
 * SERVICES (Dịch vụ)
 * ==============================
 */

// Lấy danh sách dịch vụ khám
Router.get('/services', serviceController.getAllServices);

/**
 * ==============================
 * MEDICAL RECORDS (Hồ sơ bệnh án)
 * ==============================
 */

// Lấy danh sách hồ sơ bệnh án của mình
Router.get('/medical-records', medicalRecordController.getMyMedicalRecords);

// Lấy chi tiết 1 hồ sơ bệnh án
Router.get(
    '/medical-records/:medicalRecordId',
    medicalRecordValidation.medicalRecordId, // validate id
    medicalRecordController.getMyMedicalRecordDetail,
);

/**
 * ==============================
 * BLOCKCHAIN ACCESS CONTROL
 * ==============================
 */

// Chuẩn bị dữ liệu để cấp quyền cho bác sĩ (frontend sẽ ký MetaMask)
Router.get('/appointments/:id/prepare-grant-access', appointmentController.prepareGrantAccess);

// Chuẩn bị dữ liệu để thu hồi quyền
Router.get('/appointments/:id/prepare-revoke-access', appointmentController.prepareRevokeAccess);

// Verify transaction revoke access (sau khi frontend gửi txHash)
Router.post(
    '/appointments/:id/verify-revoke-access',
    chainCheck, // middleware kiểm tra txHash hợp lệ trên blockchain
    appointmentController.verifyRevokeAccess,
);

// Verify transaction grant access
Router.post(
    '/appointments/:id/verify-grant-access',
    chainCheck,
    appointmentController.verifyGrantAccess,
);

/**
 * ==============================
 * NOTIFICATIONS (Thông báo)
 * ==============================
 */

// Lấy danh sách thông báo của mình (có phân trang)
Router.get('/notifications/me', notificationController.getNotifications);

// Đánh dấu 1 thông báo đã đọc
Router.patch('/notifications/:notificationId/read', notificationController.markAsRead);

// Đánh dấu tất cả đã đọc
Router.patch('/notifications/read-all', notificationController.markAllAsRead);

// Lấy số lượng thông báo chưa đọc
Router.get('/notifications/unread/count/:userId', notificationController.getUnreadCount);

// Xóa tất cả thông báo
Router.delete('/notifications/delete-all', notificationController.deleteAllNotifications);

// Xóa 1 thông báo
Router.delete('/notifications/:notificationId', notificationController.deleteNotification);

/**
 * Export router
 */
export const patientRoute = Router;