// models/patient.model.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'patients';

const patientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true,
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

const getAll = async () => {
    return await PatientModel.find({ deletedAt: null })
        .select('_id userId gender birthYear createdAt')
        .sort({ createdAt: -1 })
        .lean();
};

const findByUserId = async (userId) => {
    return await PatientModel.findOne({
        userId,
        deletedAt: null,
    })
        .select('_id userId gender birthYear createdAt')
        .lean();
};

const findById = async (patientId) => {
    return await PatientModel.findOne({
        _id: patientId,
        deletedAt: null,
    });
};

const updateById = async (patientId, updateData) => {
    return await PatientModel.findOneAndUpdate(
        { _id: patientId, deletedAt: null },
        updateData,
        { new: true, runValidators: true }
    );
};

const softDelete = async (patientId) => {
    return await PatientModel.findByIdAndUpdate(
        patientId,
        { deletedAt: new Date() },
        { new: true },
    );
};

const softDeleteByUserId = async (userId) => {
    return await PatientModel.findOneAndUpdate(
        { userId, deletedAt: null },
        { deletedAt: new Date() },
        { new: true }
    );
};

export const patientModel = {
    PatientModel,
    createNew,
    getAll,
    findByUserId,
    findById,
    updateById,
    softDelete,
    softDeleteByUserId,
};
