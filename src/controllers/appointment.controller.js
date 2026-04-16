import { appointmentService } from '~/services/appointment.service';

const createAppointment = async (req, res) => {
    try {
        const result = await appointmentService.createAppointment(
            req.body,
            req.user.id
        );

        return res.status(201).json({
            message: 'Đặt lịch thành công',
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            message: error.message
        });
    }
};


const getMyAppointments = async (req, res) => {
    try {
        const result = await appointmentService.getAppointmentsByPatient(req.user.id);

        return res.status(200).json({
            data: result
        });

    } catch (error) {
        return res.status(500).json({
            message: 'Lỗi server'
        });
    }
};

export const appointmentController = {
    createAppointment,
    getMyAppointments
};