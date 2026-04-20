import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';

const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, description } = data;

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
        description,
        price: service.price,
    });

    return newAppointment;
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
export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient,
    cancelMyAppointment,
    rescheduleMyAppointment,
};
