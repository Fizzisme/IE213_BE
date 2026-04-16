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
            default: null,
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
        description: String,
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
        doctorId: null,
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

export const appointmentModel = {
    APPOINTMENT_STATUS,
    AppointmentModel,
    createNew,
    getAppointmentsByPatientId,
};
