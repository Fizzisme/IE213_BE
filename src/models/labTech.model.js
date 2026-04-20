import mongoose, { Schema } from 'mongoose';

const COLLECTION_NAME = 'lab_techs';

const labTechSchema = new mongoose.Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'users',
            required: true,
            unique: true,
        },

        specialization: {
            type: [String],
            default: [],
        },

        licenseNumber: {
            type: String,
            default: null,
        },

        licenseExpiry: {
            type: Date,
            default: null,
        },

        department: {
            type: String,
            default: null,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

const LabTechModel = mongoose.model(COLLECTION_NAME, labTechSchema);

const findOneByUserId = async (userId) => {
    return await LabTechModel.findOne({ userId: userId });
};

export const labTechModel = {
    LabTechModel,
    findOneByUserId,
};
