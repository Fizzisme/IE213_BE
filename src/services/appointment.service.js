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
        price: service.price
    });

    return newAppointment;
};


const getAppointmentsByPatient = async (patientId) => {
    return await appointmentModel.getAppointmentsByPatientId(patientId);
};

export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient
};