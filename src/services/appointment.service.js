import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';

const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, patientDescription } = data;
    // validate
    if (!appointmentDateTime || !serviceId) {
        throw new Error('Thiếu dữ liệu');
    }

    const appointmentDate = new Date(appointmentDateTime);

    // check service
    const service = await serviceModel.getServiceById(serviceId);
    if (!service) {
        throw new Error('Service không tồn tại');
    }

    // create
    const newAppointment = await appointmentModel.createNew({
        patientId: patientId,
        serviceId,
        appointmentDateTime: appointmentDate,
        patientDescription,
        price: service.price,
    });

    return newAppointment;
};

const getAppointments = async () => {
    const appointments = await appointmentModel.getAppointments();
    if (!appointments) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có danh sách lịch hẹn');
    return appointments;
};

const getAppointmentsByPatient = async (patientId) => {
    return await appointmentModel.getAppointmentsByPatientId(patientId);
};

const cancelMyAppointment = async (appointmentId, patientId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new Error('Khong tim thay lich hen!');
    }
    if (appointment.patientId.toString() !== patientId.toString()) {
        throw new Error('Khong co quyen huy lich nay');
    }
    if (appointment.status !== 'PENDING') {
        throw new Error('Chi huy lich dang cho!');
    }
    appointment.status = 'CANCELLED';
    await appointment.save();
    return appointment;
};

const rescheduleMyAppointment = async (appointmentId, patientId, data) => {
    console.log();
    const updated = await appointmentModel.findOneAndUpdateAppointment(
        {
            _id: appointmentId,
            patientId: patientId.toString(),
            status: 'CANCELLED',
        },
        {
            $set: {
                status: 'PENDING',
                ...data,
            },
        },
    );

    if (!updated) {
        throw new Error('Khong the dat lai lich (khong ton tai hoac sai trang thai)');
    }

    return updated;
};

const updateStatus = async (appointmentId, payload, userId) => {
    const appointment = await appointmentModel.findOneAndUpdateAppointment(
        {
            _id: appointmentId,
        },
        {
            ...payload,
            doctorId: userId,
        },
    );
    if (!appointment) throw new ApiError(StatusCodes.BAD_REQUEST, 'Cập nhật thất bại');

    return 'Cập nhật thành công';
};

export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient,
    cancelMyAppointment,
    rescheduleMyAppointment,
    getAppointments,
    updateStatus,
};
