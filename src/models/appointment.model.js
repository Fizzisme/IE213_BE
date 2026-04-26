import mongoose from 'mongoose';
const COLLECTION_NAME = 'appointments';

const APPOINTMENT_STATUS = {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
};

const appointmentSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'doctors',
            required: true,
        },
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'services',
            required: true,
        },
        appointmentDateTime: {
            type: Date,
            required: true,
        },
        patientDescription: String,
        price: Number,
        status: {
            type: String,
            enum: Object.values(APPOINTMENT_STATUS),
            default: APPOINTMENT_STATUS.PENDING,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true },
);
appointmentSchema.index({ patientId: 1 });
appointmentSchema.index({ doctorId: 1 });
appointmentSchema.index({ appointmentDateTime: 1 });
const AppointmentModel = mongoose.model(COLLECTION_NAME, appointmentSchema);
const createNew = async (data) => {
    return await AppointmentModel.create({
        ...data,
        status: APPOINTMENT_STATUS.PENDING,
    });
};

const getAppointmentsByPatientId = async (patientId) => {
    return await AppointmentModel.find({
        patientId,
        deletedAt: null,
    })
        .populate('serviceId')
        .populate('doctorId')
        .lean();
};

const getAppointmentsByDoctorId = async (doctorId) => {
    return await AppointmentModel.find({
        doctorId,
        deletedAt: null,
    })
        .populate('serviceId')
        .populate('patientId')
        .sort({ appointmentDateTime: -1 })
        .lean();
};

const getAppointmentById = (id) => {
    return AppointmentModel.findById(id);
};

const findOneAndUpdateAppointment = (filter, update, options = {}) => {
    return AppointmentModel.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
        ...options,
    });
};

const find = async (data) => {
    return await AppointmentModel.find(data);
};

const getAppointments = async () => {
    return await AppointmentModel.find({});
};

export const appointmentModel = {
    APPOINTMENT_STATUS,
    AppointmentModel,
    createNew,
    getAppointmentsByPatientId,
    getAppointmentsByDoctorId,
    getAppointmentById,
    findOneAndUpdateAppointment,
    find,
    getAppointments,
};
