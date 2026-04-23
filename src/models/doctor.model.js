// models/doctor.model.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'doctors';

const doctorSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true,
            index: true,
        },

        specialization: {
            type: String,
            required: true,
        },

        hospital: {
            type: String,
            default: '',
        },

        licenseNumber: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: ['ACTIVE', 'SUSPENDED'],
            default: 'ACTIVE',
            index: true,
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

doctorSchema.index({ specialization: 1 });

const DoctorModel = mongoose.model(COLLECTION_NAME, doctorSchema);

const softDeleteByUserId = async (userId) => {
    return await DoctorModel.findOneAndUpdate(
        { userId, deletedAt: null },
        { deletedAt: new Date(), status: 'SUSPENDED' },
        { new: true },
    );
};

export const doctorModel = {
    DoctorModel,
    softDeleteByUserId,
};
