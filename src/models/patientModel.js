// models/patientModel.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'patients';

const PATIENT_STATUS = {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    DECEASED: 'DECEASED',
};

const patientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true,
        },

        fullName: {
            type: String,
            required: true,
            minlength: 2,
        },

        gender: {
            type: String,
            enum: ['M', 'F'],
            required: true,
        },

        birthYear: {
            type: Number,
            min: 1900,
            max: new Date().getFullYear(),
            required: true,
        },

        phoneEncrypted: {
            type: String,
            default: null,
        },

        emailEncrypted: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(PATIENT_STATUS),
            default: PATIENT_STATUS.ACTIVE,
        },

        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

const PatientModel = mongoose.model(COLLECTION_NAME, patientSchema);

const createNew = async (data) => {
    return await PatientModel.create(data);
};

const findByUserId = async (userId) => {
    return await PatientModel.findOne({
        userId,
        deletedAt: null,
    }).lean();
};

const findById = async (patientId) => {
    return await PatientModel.findById(patientId);
};

const updateById = async (patientId, updateData) => {
    return await PatientModel.findByIdAndUpdate(patientId, updateData, { new: true, runValidators: true });
};

const softDelete = async (patientId) => {
    return await PatientModel.findByIdAndUpdate(
        patientId,
        { deletedAt: new Date(), status: PATIENT_STATUS.INACTIVE },
        { new: true },
    );
};

export const patientModel = {
    PATIENT_STATUS,
    PatientModel,
    createNew,
    findByUserId,
    findById,
    updateById,
    softDelete,
};
