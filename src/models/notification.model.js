import mongoose, { Schema } from 'mongoose';

const COLLECTION_NAME = 'notifications';

const notificationSchema = new Schema(
    {
        // ================= DYNAMIC SENDER =================
        // Có thể là Patient, Doctor, Lab techs hoặc Admin (hệ thống)
        senderId: {
            type: Schema.Types.ObjectId,
            refPath: 'senderModel',
            default: null,
        },
        senderModel: {
            type: String,
            enum: ['users', 'system'],
            default: 'system',
        },

        // ================= DYNAMIC RECEIVER =================
        // Người nhận có thể là bất kỳ đối tượng nào
        receiverId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'receiverModel',
        },
        receiverModel: {
            type: String,
            required: true,
            enum: ['users', 'system'],
            index: true,
        },

        // ================= NỘI DUNG =================
        title: { type: String, required: true },
        content: { type: String, required: true },

        // ================= DOMAIN DATA =================
        event: {
            type: String,
            enum: [
                'APPOINTMENT_CREATED',
                'APPOINTMENT_CONFIRMED',
                'APPOINTMENT_CANCELLED',
                'APPOINTMENT_REMINDER',
                'APPOINTMENT_AUTO_CANCELLED',
                'DOCTOR_ASSIGNED',
                'SYSTEM',
            ],
            default: 'SYSTEM',
            index: true,
        },

        // Liên kết đến đối tượng chính (Ví dụ: Appointment, Invoice, Post...)
        refId: { type: Schema.Types.ObjectId, required: true, refPath: 'refModel' },
        refModel: { type: String, required: true },

        metadata: { type: Schema.Types.Mixed, default: {} },

        // ================= TRẠNG THÁI =================
        isRead: { type: Boolean, default: false },
        readAt: { type: Date },
        isPushSent: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// Index cho truy vấn lấy thông báo của một đối tượng bất kỳ
notificationSchema.index({ receiverId: 1, receiverModel: 1, createdAt: -1 });

const NotificationModel = mongoose.model(COLLECTION_NAME, notificationSchema);

const createNew = async (data) => {
    return await NotificationModel.create(data);
};

const find = (query) => NotificationModel.find(query);

const findById = (id) => NotificationModel.findById(id);

const findOneAndUpdate = (filter, update, options) => NotificationModel.findOneAndUpdate(filter, update, options);

const updateMany = (filter, update) => NotificationModel.updateMany(filter, update);

const countDocuments = (filter) => NotificationModel.countDocuments(filter);

const findOneAndDelete = (filter) => NotificationModel.findOneAndDelete(filter);

const deleteMany = (filter) => NotificationModel.deleteMany(filter);
export const notificationModel = {
    createNew,
    find,
    findById,
    findOneAndUpdate,
    updateMany,
    countDocuments,
    findOneAndDelete,
    deleteMany,
};
