import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';
import { doctorModel } from '~/models/doctor.model';
import { userModel } from '~/models/user.model';
import { blockchainProvider } from '~/blockchains/provider';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';

const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, doctorId, description } = data;

    // validate
    if (!appointmentDateTime || !serviceId || !doctorId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu dữ liệu (ngày giờ, dịch vụ hoặc bác sĩ)');
    }

    const appointmentDate = new Date(appointmentDateTime);
    if (appointmentDate < new Date()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không thể đặt lịch hẹn trong quá khứ');
    }

    // check service
    const service = await serviceModel.getServiceById(serviceId);
    if (!service) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Dịch vụ không tồn tại');
    }

    // --- BLOCKCHAIN UX OPTIMIZATION ---
    // Kiểm tra ví bác sĩ trước khi tạo lịch để đảm bảo luồng cấp quyền hoạt động
    const doctorProfile = await doctorModel.DoctorModel.findById(doctorId);
    if (!doctorProfile) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Bác sĩ không tồn tại');
    }

    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;
    
    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ này chưa liên kết ví Blockchain. Vui lòng chọn bác sĩ khác.');
    }

    // create
    const newAppointment = await appointmentModel.createNew({
        patientId: patientId,
        serviceId,
        doctorId: doctorId,
        appointmentDateTime: appointmentDate,
        description,
        price: service.price,
    });

    const blockchainMetadata = {
        action: 'GRANT_ACCESS',
        doctorWallet,
        durationHours: 24,
        message: 'Vui lòng ký xác nhận cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask',
    };

    return {
        appointment: newAppointment,
        blockchain: blockchainMetadata,
    };
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

/**
 * Bước 4: Xác minh giao dịch revokeAccess thành công trên Blockchain.
 */
const verifyRevokeAccess = async (appointmentId, txHash) => {
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        return 'Thu hồi quyền xem hồ sơ trên Blockchain thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thu hồi quyền thất bại');
    }
};

const cancelMyAppointment = async (appointmentId, patientId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lịch hẹn');
    }
    if (appointment.patientId.toString() !== patientId.toString()) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền hủy lịch này');
    }
    if (appointment.status !== 'PENDING') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Chỉ có thể hủy lịch đang chờ xác nhận');
    }

    appointment.status = 'CANCELLED';
    await appointment.save();

    // --- BLOCKCHAIN UX OPTIMIZATION ---
    let blockchainMetadata = null;
    if (appointment.doctorId) {
        const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
        const doctorUser = await userModel.findById(doctorProfile.userId);
        const doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet) {
            blockchainMetadata = {
                action: 'REVOKE_ACCESS',
                doctorWallet,
                message: 'Lịch hẹn đã hủy, vui lòng ký MetaMask để thu hồi quyền xem hồ sơ của Bác sĩ.',
            };
        }
    }

    return {
        message: 'Hủy lịch hẹn thành công',
        appointment: appointment,
        blockchain: blockchainMetadata,
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
    verifyRevokeAccess,
};
