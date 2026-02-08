// models/doctorModel.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'doctors';

const doctorSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
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

        phoneEncrypted: {
            type: String,
            default: null,
        },

        email: {
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
doctorSchema.index({ status: 1 });

export const DoctorModel = mongoose.model(COLLECTION_NAME, doctorSchema);
