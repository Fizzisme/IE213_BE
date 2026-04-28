// controllers/notification.controller.js

import { notificationService } from '../services/notification.service.js';

/**
 * Lấy danh sách notification của user (có phân trang bằng cursor)
 */
export const getNotifications = async (req, res) => {
    try {
        // Lấy userId từ middleware auth
        const userId  = req.user._id;

        // Query params:
        // - limit: số lượng bản ghi (mặc định 10)
        // - cursor: dùng cho pagination kiểu cursor
        // - isRead: filter đã đọc hay chưa
        const { limit = 10, cursor, isRead } = req.query;

        // Kiểm tra userId hợp lệ
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        // Giới hạn số lượng để tránh query quá nặng
        if (limit > 100) {
            return res.status(400).json({ message: 'limit cannot exceed 100' });
        }

        // Gọi service để lấy dữ liệu
        const result = await notificationService.getNotifications({
            userId,
            limit: parseInt(limit), // convert string -> number
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
 * Lấy số lượng notification chưa đọc
 */
export const getUnreadCount = async (req, res) => {
    try {
        // Lấy userId từ params
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        // Gọi service đếm số lượng chưa đọc
        const count = await notificationService.getUnreadCount(userId);

        // Trả về dạng object (chuẩn REST)
        return res.status(200).json({ count });
    } catch (error) {
        console.error('getUnreadCount error:', error);

        return res.status(500).json({ message: error.message });
    }
};

/**
 * Đánh dấu 1 notification là đã đọc
 */
export const markAsRead = async (req, res) => {
    try {
        // Lấy userId từ token (auth middleware)
        const userId = req.user?._id;

        // Lấy notificationId từ params
        const { notificationId } = req.params;

        // Kiểm tra đăng nhập
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Gọi service để update trạng thái
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
 * Đánh dấu tất cả notification là đã đọc
 */
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Gọi service update tất cả
        const result = await notificationService.markAllAsRead(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('markAllAsRead error:', error);

        return res.status(500).json({ message: error.message });
    }
};

/**
 * Xóa 1 notification
 */
export const deleteNotification = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { notificationId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Gọi service xóa
        await notificationService.deleteNotification(notificationId, userId);

        return res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('deleteNotification error:', error);

        return res.status(500).json({ message: error.message });
    }
};

/**
 * Xóa toàn bộ notification của user
 */
export const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Gọi service xóa tất cả
        const result = await notificationService.deleteAllNotifications(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('deleteAllNotifications error:', error);

        return res.status(500).json({ message: error.message });
    }
};

/**
 * Export controller
 */
export const notificationController = {
    deleteAllNotifications,
    deleteNotification,
    markAllAsRead,
    markAsRead,
    getUnreadCount,
    getNotifications,
};