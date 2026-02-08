// models/hivTestModel.js
import mongoose from 'mongoose';

const COLLECTION_NAME = 'hiv_tests';

const hivTestSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        medicalRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
        },

        age: {
            type: Number,
            required: true,
            min: 1,
        },

        wtkg: {
            type: Number,
            required: true,
        },

        gender: {
            type: String,
            enum: ['M', 'F'],
            required: true,
        },

        karnof: Number,

        symptom: Boolean,

        cd40: Number,
        cd420: Number,
        cd80: Number,
        cd820: Number,

        preanti: Boolean,
        offtrt: Boolean,
        oprior: Boolean,
        z30: Boolean,

        trt: {
            type: Number,
            enum: [1, 2, 3, 4],
        },

        strat: {
            type: Number,
            enum: [1, 2, 3],
        },

        infected: {
            type: Boolean,
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

hivTestSchema.index({ patientId: 1 });
hivTestSchema.index({ doctorId: 1 });

export const HIVTestModel = mongoose.model(COLLECTION_NAME, hivTestSchema);
