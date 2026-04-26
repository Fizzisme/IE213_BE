import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { doctorModel } from '~/models/doctor.model';
import { userModel } from '~/models/user.model';
import { blockchainProvider } from '~/blockchains/provider';
import { blockchainAbis, dynamicAccessControlContract } from '~/blockchains/contract';
import { validateContractTransaction } from '~/utils/blockchainVerification';

const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, patientDescription } = data;
    console.log(data);

    // Hệ thống set cứng 1 bác sĩ
    const doctorId = '69b8ec3de5bed9e6a3808110';

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
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Bác sĩ này chưa liên kết ví Blockchain. Vui lòng chọn bác sĩ khác.',
        );
    }

    // create
    const newAppointment = await appointmentModel.createNew({
        patientId: patientId,
        serviceId,
        doctorId: doctorId,
        appointmentDateTime: appointmentDate,
        patientDescription,
        price: service.price,
    });

    const blockchainMetadata = {
        action: 'GRANT_ACCESS',
        contractAddress: dynamicAccessControlContract.target,
        method: 'grantAccess',
        args: [doctorWallet, 24],
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
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ chưa liên kết ví Blockchain');
    }

    return {
        message: 'Thông tin sẵn sàng, vui lòng ký cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask',
        contractAddress: dynamicAccessControlContract.target,
        method: 'grantAccess',
        args: [doctorWallet, 24],
        doctorWallet,
        durationHours: 24, // Mặc định cấp quyền xem trong 24h
        appointmentId,
    };
};

/**
 * Bước 2: Xác minh giao dịch grantAccess thành công trên Blockchain.
 */
const verifyGrantAccess = async (appointmentId, txHash, currentUser) => {
    // 1. Lấy lại dữ liệu cuộc hẹn để biết giao dịch này đang cấp quyền cho bác sĩ nào.
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');
    }

    // 2. Suy ra ví bác sĩ đích từ appointment để đối chiếu với calldata của tx.
    const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
    if (!doctorProfile) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy thông tin bác sĩ');
    }

    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ chưa liên kết ví Blockchain');
    }

    const patientUser = await userModel.findById(currentUser._id);
    const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa liên kết ví Blockchain');
    }

    // 3. Đọc transaction thật từ chain và kiểm tra đúng contract / method / args grantAccess.
    const tx = await blockchainProvider.getTransaction(txHash);
    validateContractTransaction({
        tx,
        abi: blockchainAbis.DynamicAccessControl,
        expectedContract: dynamicAccessControlContract.target,
        expectedMethod: 'grantAccess',
        expectedArgs: [doctorWallet, '24'],
    });

    // 4. Ngoài calldata đúng, tx còn phải do chính ví bệnh nhân hiện tại ký.
    if (tx.from.toLowerCase() !== patientWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch cấp quyền không được ký bởi ví bệnh nhân hiện tại');
    }

    // 5. Chỉ khi receipt mined thành công mới được chuyển appointment sang CONFIRMED.
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        appointment.status = appointmentModel.APPOINTMENT_STATUS.CONFIRMED;
        await appointment.save();
        return {
            message: 'Cấp quyền xem hồ sơ trên Blockchain thành công',
            appointment,
        };
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
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    return {
        message: 'Thông tin sẵn sàng, vui lòng ký thu hồi quyền xem hồ sơ qua MetaMask',
        contractAddress: dynamicAccessControlContract.target,
        method: 'revokeAccess',
        args: [doctorWallet],
        doctorWallet,
        appointmentId,
    };
};

const getAppointments = async () => {
    const appointments = await appointmentModel.getAppointments();
    if (!appointments) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có danh sách lịch hẹn');
    return appointments;
};

const getAppointmentsByPatient = async (patientId) => {
    return await appointmentModel.getAppointmentsByPatientId(patientId);
};

const getAppointmentsByDoctor = async (doctorUserId) => {
    const doctorProfile = await doctorModel.DoctorModel.findOne({ userId: doctorUserId, deletedAt: null });
    if (!doctorProfile) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ bác sĩ');
    }

    return await appointmentModel.getAppointmentsByDoctorId(doctorProfile._id);
};

/**
 * Bước 4: Xác minh giao dịch revokeAccess thành công trên Blockchain.
 */
const verifyRevokeAccess = async (appointmentId, txHash, currentUser) => {
    // 1. Lấy appointment gốc để biết đang thu hồi quyền xem của bác sĩ nào.
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');
    }

    const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    const patientUser = await userModel.findById(currentUser._id);
    const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet || !patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu dữ liệu ví blockchain để xác minh giao dịch thu hồi quyền');
    }

    // 2. Tx phải gọi đúng revokeAccess với đúng doctorWallet mà appointment đang gắn tới.
    const tx = await blockchainProvider.getTransaction(txHash);
    validateContractTransaction({
        tx,
        abi: blockchainAbis.DynamicAccessControl,
        expectedContract: dynamicAccessControlContract.target,
        expectedMethod: 'revokeAccess',
        expectedArgs: [doctorWallet],
    });

    // 3. Tx thu hồi cũng phải do chính ví bệnh nhân hiện tại ký.
    if (tx.from.toLowerCase() !== patientWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thu hồi quyền không được ký bởi ví bệnh nhân hiện tại');
    }

    // 4. Chờ receipt để chắc giao dịch đã lên block và không bị revert.
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
    if (
        ![appointmentModel.APPOINTMENT_STATUS.PENDING, appointmentModel.APPOINTMENT_STATUS.CONFIRMED].includes(
            appointment.status,
        )
    ) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Chỉ có thể hủy lịch đang chờ hoặc đã xác nhận');
    }

    appointment.status = 'CANCELLED';
    await appointment.save();

    // --- BLOCKCHAIN UX OPTIMIZATION ---
    let blockchainMetadata = null;
    if (appointment.doctorId) {
        const doctorProfile = await doctorModel.DoctorModel.findById(appointment.doctorId);
        const doctorUser = await userModel.findById(doctorProfile.userId);
        const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet) {
            blockchainMetadata = {
                action: 'REVOKE_ACCESS',
                contractAddress: dynamicAccessControlContract.target,
                method: 'revokeAccess',
                args: [doctorWallet],
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

const updateStatus = async (appointmentId, payload, userId) => {
    const appointment = await appointmentModel.findOneAndUpdateAppointment(
        {
            _id: appointmentId,
        },
        {
            ...payload,
            doctorId: userId,
        },
    );
    if (!appointment) throw new ApiError(StatusCodes.BAD_REQUEST, 'Cập nhật thất bại');

    return 'Cập nhật thành công';
};

export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient,
    getAppointmentsByDoctor,
    cancelMyAppointment,
    rescheduleMyAppointment,
    getAppointments,
    updateStatus,
    prepareGrantAccess,
    verifyGrantAccess,
    prepareRevokeAccess,
    verifyRevokeAccess,
};
