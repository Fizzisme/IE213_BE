import mongoose from 'mongoose';

const COLLECTION_NAME = 'services';

const serviceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        description: {
            type: String,
            default: '',
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true },
);

// 🔥 Index để query nhanh
serviceSchema.index({ name: 1 });

const ServiceModel = mongoose.model(COLLECTION_NAME, serviceSchema);
const createNew = async (data) => {
    return await ServiceModel.create(data);
};

const getAllServices = async () => {
    return await ServiceModel.find({ isActive: true }).lean();
};

const getServiceById = async (id) => {
    return await ServiceModel.findById(id).lean();
};
export const serviceModel = {
    ServiceModel,
    createNew,
    getAllServices,
    getServiceById,
};
