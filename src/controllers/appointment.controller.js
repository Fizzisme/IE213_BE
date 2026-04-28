import { appointmentService } from '~/services/appointment.service';
import { patientModel } from '~/models/patient.model';
import { notificationService } from '~/services/notification.service';
import { StatusCodes } from 'http-status-codes';

/**
 * Tạo lịch khám mới
 * Flow:
 * - Lấy user hiện tại
 * - Tìm patient tương ứng
 * - Gọi service tạo lịch (có thể kèm blockchain payload)
 * - Gửi notification
 * - Trả kết quả cho frontend
 */
const createAppointment = async (req, res) => {
    try {
        const userId = req.user._id;

        // Tìm patient theo user
        const patient = await patientModel.findByUserId(userId);

        // Tạo lịch khám + dữ liệu blockchain (nếu có)
        const { appointment, blockchain } =
            await appointmentService.createAppointment(req.body, patient._id);

        // Tạo notification cho user
        const notiPayload = {
            senderId: null,
            senderModel: 'system',
            receiverId: req.user._id,
            receiverModel: 'users',
            event: 'APPOINTMENT_CREATED',
            title: 'Đặt lịch thành công',
            content: `Lịch khám của bạn đã được tạo cho ngày ${appointment.appointmentDateTime}`,
            refId: appointment._id,
            refModel: 'appointments',
        };

        await notificationService.createNotification(notiPayload);

        return res.status(201).json({
            message: 'Đặt lịch thành công',
            data: appointment,

            // Trả blockchain payload để frontend gọi MetaMask
            blockchain: blockchain,
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            message: error.message,
        });
    }
};

/**
 * Lấy danh sách lịch khám của user hiện tại
 */
const getMyAppointments = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Tìm patient tương ứng
        const patient = await patientModel.findByUserId(userId);

        // Nếu user chưa có patient record
        if (!patient) {
            return res.status(200).json([]);
        }

        // Lấy danh sách lịch khám
        const result = await appointmentService.getAppointmentsByPatient(
            patient._id
        );

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Hủy lịch khám của user
 */
const cancelMyAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const userId = req.user._id;

        const patient = await patientModel.findByUserId(userId);

        // Gọi service hủy lịch
        const result = await appointmentService.cancelMyAppointment(
            appointmentId,
            patient._id
        );

        // Gửi notification sau khi hủy
        await notificationService.createNotification({
            senderId: null,
            senderModel: 'system',
            receiverId: req.user._id,
            receiverModel: 'users',
            event: 'APPOINTMENT_CANCELLED',
            title: 'Lịch khám đã hủy',
            content:
                'Bạn đã hủy lịch khám thành công. Mong sớm được phục vụ bạn lần sau.',
            refId: result.appointment._id,
            refModel: 'appointments',
            metadata: {
                cancelDate: new Date(),
                reason: 'Khách hàng chủ động hủy',
            },
        });

        if (result) {
            return res.status(200).json(result);
        }
    } catch (e) {
        return res.status(e.statusCode || 500).json({
            message: e.message || 'Internal Server Error',
        });
    }
};

/**
 * Đổi lịch khám
 */
const rescheduleMyAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;

        // Lấy patient
        const patient = await patientModel.findByUserId(req.user._id);
        const patientId = patient._id;

        // Gọi service đổi lịch
        const result =
            await appointmentService.rescheduleMyAppointment(
                appointmentId,
                patientId,
                req.body
            );

        // Gửi notification sau khi đổi lịch
        await notificationService.createNotification({
            senderId: null,
            senderModel: 'system',
            receiverId: req.user._id,
            receiverModel: 'users',
            event: 'APPOINTMENT_RESCHEDULED',
            title: 'Lịch khám đã được đổi',
            content: `Lịch khám của bạn đã được thay đổi sang ngày ${result.appointmentDateTime}.`,
            refId: result._id,
            refModel: 'appointments',
            metadata: {
                newDate: req.body.appointmentDateTime,
                rescheduledAt: new Date(),
            },
        });

        return res.status(200).json(result);
    } catch (e) {
        return res.status(e.statusCode || 500).json({
            message: e.message || 'Internal Server Error',
        });
    }
};

/**
 * Lấy tất cả lịch khám (admin hoặc hệ thống)
 */
const getAppointments = async (req, res, next) => {
    try {
        const result = await appointmentService.getAppointments();
        return res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * Cập nhật trạng thái lịch khám
 */
const updateStatus = async (req, res, next) => {
    try {
        const appointmentId = req.params.appointmentId;

        const result = await appointmentService.updateStatus(
            appointmentId,
            req.body,
            req.user._id
        );

        return res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * Lấy lịch khám của bác sĩ
 */
const getDoctorAppointments = async (req, res, next) => {
    try {
        const result =
            await appointmentService.getAppointmentsByDoctor(
                req.user._id
            );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Chuẩn bị dữ liệu grant quyền (trả về payload để frontend ký MetaMask)
 */
const prepareGrantAccess = async (req, res, next) => {
    try {
        const result =
            await appointmentService.prepareGrantAccess(req.params.id);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Verify transaction grant quyền trên blockchain
 */
const verifyGrantAccess = async (req, res, next) => {
    try {
        // Controller chỉ chuyển dữ liệu xuống service
        // Service sẽ:
        // - gọi RPC
        // - verify transaction
        // - cập nhật DB

        const result =
            await appointmentService.verifyGrantAccess(
                req.params.id,
                req.body.txHash,
                req.user
            );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Chuẩn bị revoke quyền
 */
const prepareRevokeAccess = async (req, res, next) => {
    try {
        const result =
            await appointmentService.prepareRevokeAccess(req.params.id);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Verify revoke quyền trên blockchain
 */
const verifyRevokeAccess = async (req, res, next) => {
    try {
        const result =
            await appointmentService.verifyRevokeAccess(
                req.params.id,
                req.body.txHash,
                req.user
            );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Export controller
 */
export const appointmentController = {
    createAppointment,
    getMyAppointments,
    getDoctorAppointments,
    cancelMyAppointment,
    rescheduleMyAppointment,
    getAppointments,
    updateStatus,
    prepareGrantAccess,
    verifyGrantAccess,
    prepareRevokeAccess,
    verifyRevokeAccess,
};