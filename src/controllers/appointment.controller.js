import { appointmentService } from '~/services/appointment.service';
import { patientModel } from '~/models/patient.model';
import { notificationService } from '~/services/notification.service';
const createAppointment = async (req, res) => {
    try {
        const userId = req.user._id;
        const patient = await patientModel.findByUserId(userId);
        const result = await appointmentService.createAppointment(req.body, patient._id);
        const notiPayload = {
            senderId: null,
            senderModel: 'system',
            receiverId: req.user._id,
            receiverModel: 'users',
            event: 'APPOINTMENT_CREATED',
            title: 'Đặt lịch thành công',
            content: `Lịch khám của bạn đã được tạo cho ngày ${result.appointmentDateTime}`,
            refId: result._id,
            refModel: 'appointments',
        };
        const noti = await notificationService.createNotification(notiPayload);
        console.log('[NOTI] Created successfully', {
            notiId: noti._id,
            receiverId: noti.receiverId,
        });
        return res.status(201).json({
            message: 'Đặt lịch thành công',
            data: result,
        });
    } catch (error) {
        return res.status(400).json({
            message: error.message,
        });
    }
};

const getMyAppointments = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(userId);
        const patient = await patientModel.findByUserId(userId);
        console.log(patient);
        const result = await appointmentService.getAppointmentsByPatient(patient._id);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({
            message: 'Lỗi server',
        });
    }
};

const cancelMyAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const userId = req.user._id;
        const patient = await patientModel.findByUserId(userId);
        const result = await appointmentService.cancelMyAppointment(appointmentId, patient._id);
        await notificationService.createNotification({
            senderId: null,
            senderModel: 'system',
            receiverId: req.user._id,
            receiverModel: 'users',
            event: 'APPOINTMENT_CANCELLED',
            title: 'Lịch khám đã hủy',
            content: 'Bạn đã hủy lịch khám thành công. Mong sớm được phục vụ bạn lần sau.',
            refId: result._id,
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

const rescheduleMyAppointment = async (req, res) => {
    try {
        console.log(req.body);
        const appointmentId = req.params.id;
        const patient = await patientModel.findByUserId(req.user._id);
        const patientId = patient._id;
        const result = await appointmentService.rescheduleMyAppointment(appointmentId, patientId, req.body);
        // 2. Gửi thông báo sau khi đổi lịch thành công
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
        console.log(result);
        return res.status(200).json(result);
    } catch (e) {
        return res.status(e.statusCode || 500).json({
            message: e.message || 'Internal Server Error',
        });
    }
};

const prepareGrantAccess = async (req, res, next) => {
    try {
        const result = await appointmentService.prepareGrantAccess(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const verifyGrantAccess = async (req, res, next) => {
    try {
        const result = await appointmentService.verifyGrantAccess(req.params.id, req.body.txHash);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const prepareRevokeAccess = async (req, res, next) => {
    try {
        const result = await appointmentService.prepareRevokeAccess(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const appointmentController = {
    createAppointment,
    getMyAppointments,
    cancelMyAppointment,
    rescheduleMyAppointment,
    prepareGrantAccess,
    verifyGrantAccess,
    prepareRevokeAccess,
};


