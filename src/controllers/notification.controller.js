// controllers/notification.controller.js

import { notificationService } from '../services/notification.service.js';

/**
 * GET notifications
 */
export const getNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 10, cursor, isRead } = req.query;

        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        if (limit > 100) {
            return res.status(400).json({ message: 'limit cannot exceed 100' });
        }

        const result = await notificationService.getNotifications({
            userId,
            limit: parseInt(limit),
            cursor,
            isRead,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('getNotifications error:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * GET unread count
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const count = await notificationService.getUnreadCount(userId);

        return res.status(200).json({ count }); // ❗ FIX
    } catch (error) {
        console.error('getUnreadCount error:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * PATCH mark one as read
 */
export const markAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { notificationId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await notificationService.markAsRead(notificationId, userId);

        return res.status(200).json({
            message: 'Marked as read',
            data: result,
        });
    } catch (error) {
        console.error('markAsRead error:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * PATCH mark all
 */
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await notificationService.markAllAsRead(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('markAllAsRead error:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * DELETE one
 */
export const deleteNotification = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { notificationId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        await notificationService.deleteNotification(notificationId, userId);

        return res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('deleteNotification error:', error);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * DELETE all
 */
export const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await notificationService.deleteAllNotifications(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('deleteAllNotifications error:', error);
        return res.status(500).json({ message: error.message });
    }
};
export const notificationController = {
    deleteAllNotifications,
    deleteNotification,
    markAllAsRead,
    markAsRead,
    getUnreadCount,
    getNotifications,
};
