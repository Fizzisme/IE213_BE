import { appointmentService } from '~/services/appointment.service';
import { patientModel } from '~/models/patient.model';
import { notificationService } from '~/services/notification.service';
import { StatusCodes } from 'http-status-codes';
const createAppointment = async (req, res) => {
    try {
        const userId = req.user._id;
        const patient = await patientModel.findByUserId(userId);
        const { appointment, blockchain } = await appointmentService.createAppointment(req.body, patient._id);

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
        const noti = await notificationService.createNotification(notiPayload);
        return res.status(201).json({
            message: 'Đặt lịch thành công',
            data: appointment,
            blockchain: blockchain, // Trả về để Frontend hiện MetaMask ngay
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            message: error.message,
        });
    }
};

const getMyAppointments = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const patient = await patientModel.findByUserId(userId);

        if (!patient) {
            return res.status(200).json([]);
        }

        const result = await appointmentService.getAppointmentsByPatient(patient._id);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
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

const rescheduleMyAppointment = async (req, res) => {
    try {
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

        return res.status(200).json(result);
    } catch (e) {
        return res.status(e.statusCode || 500).json({
            message: e.message || 'Internal Server Error',
        });
    }
};

const getAppointments = async (req, res, next) => {
    try {
        const result = await appointmentService.getAppointments();
        return res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const appointmentId = req.params.appointmentId;
        const result = await appointmentService.updateStatus(appointmentId, req.body, req.user._id);

        return res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const getDoctorAppointments = async (req, res, next) => {
    try {
        const result = await appointmentService.getAppointmentsByDoctor(req.user._id);
        res.status(200).json(result);
    } catch (error) {
        next(error);
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
        // Controller chỉ chuyển appointmentId + txHash + người dùng hiện tại xuống service để service verify on-chain.
        const result = await appointmentService.verifyGrantAccess(req.params.id, req.body.txHash, req.user);
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

const verifyRevokeAccess = async (req, res, next) => {
    try {
        // Tương tự grant access: controller không tự verify, chỉ điều phối dữ liệu cho service xử lý đầy đủ.
        const result = await appointmentService.verifyRevokeAccess(req.params.id, req.body.txHash, req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

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
