// models/patient.model.js
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

        phoneNumber: {
            type: String,
            required: true,
        },

        isActive: {
            type: Boolean,
            default: false,
            required: true,
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

patientSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

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

const findByNationId = async (nationId) => {
    return await PatientModel.findOne({
        nationId: nationId,
    });
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

// Thêm trước dòng export
const softDeleteByUserId = async (userId) => {
    return await PatientModel.findOneAndUpdate(
        { userId, deletedAt: null },
        { deletedAt: new Date(), isActive: false },
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
    softDeleteByUserId,
    findByNationId,
};
