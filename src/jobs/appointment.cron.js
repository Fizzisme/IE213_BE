import cron from 'node-cron';
import { appointmentModel } from '../models/appointment.model.js';
import { notificationService } from '../services/notification.service.js';

export const startAppointmentCron = () => {
    // chạy mỗi phút
    cron.schedule('* * * * *', async () => {
        console.log('[CRON] Checking expired appointments...');

        try {
            const now = new Date();

            const expiredAppointments = await appointmentModel.find({
                status: 'PENDING',
                appointmentDateTime: { $lte: now },
                doctorId: null,
            });

            if (expiredAppointments.length === 0) return;

            for (const appt of expiredAppointments) {
                // update status
                appt.status = 'CANCELLED';
                await appt.save();

                // tạo notification
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

                console.log(`Auto cancelled appointment: ${appt._id}`);
            }
        } catch (err) {
            console.error('[CRON ERROR]', err.message);
        }
    });
};
