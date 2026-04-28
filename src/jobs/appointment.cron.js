import cron from 'node-cron';
import { appointmentModel } from '../models/appointment.model.js';
import { notificationService } from '../services/notification.service.js';

/**
 * Khởi động cron job xử lý các lịch hẹn quá hạn
 */
export const startAppointmentCron = () => {
    // Thiết lập cron job chạy mỗi phút (* * * * *)
    cron.schedule('* * * * *', async () => {
        console.log('[CRON] Checking expired appointments...');

        try {
            // Lấy thời gian hiện tại
            const now = new Date();

            /**
             * Tìm các lịch hẹn:
             * - Trạng thái là PENDING (chưa được xử lý)
             * - Thời gian hẹn đã qua (<= hiện tại)
             * - Chưa có bác sĩ nhận (doctorId = null)
             */
            const expiredAppointments = await appointmentModel.find({
                status: 'PENDING',
                appointmentDateTime: { $lte: now },
                doctorId: null,
            });

            // Nếu không có lịch nào thì kết thúc
            if (expiredAppointments.length === 0) return;

            // Duyệt từng lịch hẹn quá hạn
            for (const appt of expiredAppointments) {
                // Cập nhật trạng thái thành CANCELLED
                appt.status = 'CANCELLED';
                await appt.save();

                // Tạo notification thông báo cho bệnh nhân
                await notificationService.createNotification({
                    senderId: null,
                    senderModel: 'system',
                    receiverId: appt.patientId,
                    receiverModel: 'users',
                    event: 'APPOINTMENT_AUTO_CANCELLED',
                    title: 'Lịch khám bị hủy',
                    content: `Lịch khám lúc ${appt.appointmentDateTime} đã bị hủy do không có bác sĩ.`,
                    refId: appt._id,
                    refModel: 'appointments',
                });

                // Log ra console để theo dõi
                console.log(`Auto cancelled appointment: ${appt._id}`);
            }
        } catch (err) {
            // Log lỗi nếu có
            console.error('[CRON ERROR]', err.message);
        }
    });
};