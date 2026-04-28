import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'services';

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Service (dịch vụ khám chữa bệnh)
 */
const serviceSchema = new mongoose.Schema(
    {
        // Tên dịch vụ
        name: {
            type: String,
            required: true,
            trim: true, // loại bỏ khoảng trắng đầu/cuối
        },

        // Giá dịch vụ
        price: {
            type: Number,
            required: true,
            min: 0, // giá không được âm
        },

        // Mô tả dịch vụ
        description: {
            type: String,
            default: '',
        },

        // Trạng thái hoạt động của dịch vụ
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // tự động tạo createdAt, updatedAt
    },
);

/**
 * Index để tối ưu truy vấn theo tên dịch vụ
 */
serviceSchema.index({ name: 1 });

/**
 * Khởi tạo model
 */
const ServiceModel = mongoose.model(COLLECTION_NAME, serviceSchema);

/**
 * Tạo dịch vụ mới
 */
const createNew = async (data) => {
    return await ServiceModel.create(data);
};

/**
 * Lấy danh sách tất cả dịch vụ
 */
const getAllServices = async () => {
    return await ServiceModel.find().lean();
};

/**
 * Lấy thông tin dịch vụ theo ID
 */
const getServiceById = async (id) => {
    return await ServiceModel.findById(id).lean();
};

/**
 * Export model và các hàm thao tác
 */
export const serviceModel = {
    ServiceModel,
    createNew,
    getAllServices,
    getServiceById,
};