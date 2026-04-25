import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';
import { doctorModel } from '~/models/doctor.model';
import { userModel } from '~/models/user.model';
import { blockchainProvider } from '~/blockchains/provider';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';

const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, description } = data;

    // validate
    if (!appointmentDateTime || !serviceId) {
        throw new Error('Thiếu dữ liệu');
    }

    const appointmentDate = new Date(appointmentDateTime);

    // check service
    const service = await serviceModel.getServiceById(serviceId);
    if (!service) {
        throw new Error('Service không tồn tại');
    }

    // create
    const newAppointment = await appointmentModel.createNew({
        patientId: patientId,
        serviceId,
        appointmentDateTime: appointmentDate,
        description,
        price: service.price,
    });

    return newAppointment;
};

// --- BLOCKCHAIN ACCESS CONTROL LOGIC ---

/**
 * Bước 1: Chuẩn bị thông tin để Bệnh nhân cấp quyền cho Bác sĩ qua MetaMask.
 */
const prepareGrantAccess = async (appointmentId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');

    // Kiểm tra doctorId đã được phân công chưa
    if (!appointment.doctorId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Lịch hẹn chưa được phân công bác sĩ');
    }

    // Lấy thông tin Doctor User để lấy Wallet
    const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
    if (!doctorProfile) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy thông tin bác sĩ');

    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ chưa liên kết ví Blockchain');
    }

    return {
        message: 'Thông tin sẵn sàng, vui lòng ký cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask',
        doctorWallet,
        durationHours: 24, // Mặc định cấp quyền xem trong 24h
        appointmentId,
    };
};

/**
 * Bước 2: Xác minh giao dịch grantAccess thành công trên Blockchain.
 */
const verifyGrantAccess = async (appointmentId, txHash) => {
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        // Có thể cập nhật trạng thái appointment hoặc log lại
        return 'Cấp quyền xem hồ sơ trên Blockchain thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch cấp quyền thất bại');
    }
};

/**
 * Bước 3: Chuẩn bị thông tin để Bệnh nhân thu hồi quyền xem của Bác sĩ.
 */
const prepareRevokeAccess = async (appointmentId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');

    const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

    return {
        message: 'Thông tin sẵn sàng, vui lòng ký thu hồi quyền xem hồ sơ qua MetaMask',
        doctorWallet,
        appointmentId,
    };
};

const getAppointmentsByPatient = async (patientId) => {
    return await appointmentModel.getAppointmentsByPatientId(patientId);
};

const cancelMyAppointment = async (appointmentId, patientId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new Error('Khong tim thay lich hen!');
    }
    if (appointment.patientId.toString() !== patientId.toString()) {
        throw new Error('Khong co quyen huy lich nay');
    }
    if (appointment.status !== 'PENDING') {
        throw new Error('Chi huy lich dang cho!');
    }

    appointment.status = 'CANCELLED';
    await appointment.save();

    // --- BLOCKCHAIN LOGIC ---
    // Kiểm tra xem bác sĩ đã được gán chưa để nhắc nhở thu hồi quyền
    let needsRevoke = false;
    let doctorWallet = null;

    if (appointment.doctorId) {
        const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
        const doctorUser = await userModel.findById(doctorProfile.userId);
        doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet) {
            needsRevoke = true;
        }
    }

    return {
        message: 'Hủy lịch hẹn thành công',
        appointment: appointment,
        blockchain: {
            needsRevoke,
            doctorWallet,
            reason: 'Lịch hẹn đã bị hủy, bạn nên thu hồi quyền truy cập hồ sơ của bác sĩ này trên Blockchain.',
        },
    };
};

const rescheduleMyAppointment = async (appointmentId, patientId, data) => {
    const updated = await appointmentModel.findOneAndUpdateAppointment(
        {
            _id: appointmentId,
            patientId: patientId.toString(),
            status: 'CANCELLED',
        },
        {
            $set: {
                status: 'PENDING',
                ...data,
            },
        },
    );

    if (!updated) {
        throw new Error('Khong the dat lai lich (khong ton tai hoac sai trang thai)');
    }

    return updated;
};

export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient,
    cancelMyAppointment,
    rescheduleMyAppointment,
    prepareGrantAccess,
    verifyGrantAccess,
    prepareRevokeAccess,
};
