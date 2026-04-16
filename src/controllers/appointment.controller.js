import { appointmentService } from '~/services/appointment.service';
import { patientModel } from '~/models/patient.model';
const createAppointment = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(userId);
        const patient = await patientModel.findByUserId(userId);
        console.log(patient);
        const result = await appointmentService.createAppointment(
            req.body,
            patient._id
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
        const userId = req.user._id;
        console.log(userId);
        const patient = await patientModel.findByUserId(userId);
        console.log(patient);
        const result = await appointmentService.getAppointmentsByPatient(patient._id);
        return res.status(200).json(result);

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