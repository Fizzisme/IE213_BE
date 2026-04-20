// services/notification.service.js
import { notificationModel } from '../models/notification.model.js';

const createNotification = async (data) => {
    return await notificationModel.createNew(data);
};

const getNotifications = async ({ userId, limit, cursor, isRead }) => {
    const query = { receiverId: userId };

    if (isRead !== undefined) {
        query.isRead = isRead === 'true';
    }

    if (cursor) {
        const cursorDoc = await notificationModel.findById(cursor);
        if (cursorDoc) {
            query.createdAt = { $lt: cursorDoc.createdAt };
        }
    }

    const data = await notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean();

    const hasMore = data.length > limit;
    if (hasMore) data.pop();

    return {
        data,
        nextCursor: data.length ? data[data.length - 1]._id : null,
        hasMore,
    };
};

const markAsRead = async (notificationId, userId) => {
    const updated = await notificationModel.findOneAndUpdate(
        { _id: notificationId, receiverId: userId, isRead: false },
        { isRead: true, readAt: new Date() },
        { new: true },
    );

    if (!updated) throw new Error('Notification not found');

    return updated;
};

const markAllAsRead = async (userId) => {
    const result = await notificationModel.updateMany(
        { receiverId: userId, isRead: false },
        { isRead: true, readAt: new Date() },
    );

    return result;
};

const getUnreadCount = async (userId) => {
    return await notificationModel.countDocuments({
        receiverId: userId,
        isRead: false,
    });
};

const deleteNotification = async (notificationId, userId) => {
    const deleted = await notificationModel.findOneAndDelete({
        _id: notificationId,
        receiverId: userId,
    });

    if (!deleted) throw new Error('Notification not found');

    return deleted;
};

const deleteAllNotifications = async (userId) => {
    return await notificationModel.deleteMany({
        receiverId: userId,
    });
};

export const notificationService = {
    createNotification,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
};