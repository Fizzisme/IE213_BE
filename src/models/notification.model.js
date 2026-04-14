import mongoose, { Schema } from 'mongoose';

const COLLECTION_NAME = 'notifications';

const notificationSchema = new Schema(
    {
        sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        content: { type: String, required: true },
        type: {
            type: String,
            enum: ['LIKE', 'COMMENT', 'FOLLOW', 'SYSTEM'],
            required: true,
            default: 'SYSTEM',
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

notificationSchema.index({ receiver: 1, isRead: 1, createdAt: -1 });

const NotificationModel = mongoose.model(COLLECTION_NAME, notificationSchema);

const createNew = async (data) => {
    return await NotificationModel.create(data);
};

export const notificationModel = {
    createNew,
};
