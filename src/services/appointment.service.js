import { appointmentModel } from '~/models/appointment.model';
import { serviceModel } from '~/models/service.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { doctorModel } from '~/models/doctor.model';
import { patientModel } from '~/models/patient.model';
import { userModel } from '~/models/user.model';
import { blockchainProvider } from '~/blockchains/provider';
import { blockchainAbis, dynamicAccessControlContract, identityManagerContract } from '~/blockchains/contract';
import { validateContractTransaction } from '~/utils/blockchainVerification';
import { rpcCache } from '~/utils/rpcCache';
import { env } from '~/config/environment';

/**
 * Mapping role trên Blockchain (smart contract)
 */
const BLOCKCHAIN_ROLE = {
    PATIENT: 1,
    DOCTOR: 2,
};

/**
 * Tạo lịch hẹn
 */
const createAppointment = async (data, patientId) => {
    const { appointmentDateTime, serviceId, patientDescription } = data;

    // Tạm thời fix cứng doctor (demo)
    const doctorId = '69b8ec3de5bed9e6a3808110';

    // Validate dữ liệu đầu vào
    if (!appointmentDateTime || !serviceId || !doctorId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu dữ liệu (ngày giờ, dịch vụ hoặc bác sĩ)');
    }

    // Không cho đặt lịch trong quá khứ
    const appointmentDate = new Date(appointmentDateTime);
    if (appointmentDate < new Date()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không thể đặt lịch hẹn trong quá khứ');
    }

    // Kiểm tra service tồn tại
    const service = await serviceModel.getServiceById(serviceId);
    if (!service) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Dịch vụ không tồn tại');
    }

    /**
     * Tối ưu UX blockchain:
     * Kiểm tra trước bác sĩ có ví hay chưa để tránh fail flow cấp quyền
     */
    const doctorProfile = await doctorModel.DoctorModel.findById(doctorId);
    if (!doctorProfile) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Bác sĩ không tồn tại');
    }

    const doctorUser = await userModel.findById(doctorProfile.userId);

    // Lấy wallet từ authProviders
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Bác sĩ này chưa liên kết ví Blockchain. Vui lòng chọn bác sĩ khác.',
        );
    }

    // Tạo lịch hẹn
    const newAppointment = await appointmentModel.createNew({
        patientId,
        serviceId,
        doctorId,
        appointmentDateTime: appointmentDate,
        patientDescription,
        price: service.price,
    });

    /**
     * Trả metadata để frontend gọi MetaMask
     */
    const blockchainMetadata = {
        action: 'GRANT_ACCESS',
        contractAddress: dynamicAccessControlContract.target,
        method: 'grantAccess',
        args: [doctorWallet, 24], // cấp quyền 24h
        doctorWallet,
        durationHours: 24,
        message: 'Vui lòng ký xác nhận cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask',
    };

    return {
        appointment: newAppointment,
        blockchain: blockchainMetadata,
    };
};

/**
 * Bước 1: Chuẩn bị dữ liệu để cấp quyền cho bác sĩ (frontend ký MetaMask)
 */
const prepareGrantAccess = async (appointmentId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');

    // Lấy thông tin bệnh nhân
    const patientProfile = await patientModel.findById(appointment.patientId);
    if (!patientProfile) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy thông tin bệnh nhân');
    }

    const patientUser = await userModel.findById(patientProfile.userId);
    const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa liên kết ví Blockchain');
    }

    // Kiểm tra đã có doctor chưa
    if (!appointment.doctorId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Lịch hẹn chưa được phân công bác sĩ');
    }

    // Lấy ví bác sĩ
    const doctorProfile = await doctorModel.findOneByUserId(appointment.doctorId);
    if (!doctorProfile) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy thông tin bác sĩ');

    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ chưa liên kết ví Blockchain');
    }

    /**
     * Kiểm tra role đã được đăng ký trên blockchain chưa
     */
    // Lưu cache: Roles được lưu cache 24 giờ (roles không đổi thường xuyên)
    const [isPatientActiveOnChain, isDoctorActiveOnChain] = await Promise.all([
        rpcCache.getOrFetch(
            `role:${patientWallet}:${BLOCKCHAIN_ROLE.PATIENT}`,
            () => identityManagerContract.hasRole(patientWallet, BLOCKCHAIN_ROLE.PATIENT),
            env.RPC_ROLE_TTL // 24h TTL
        ),
        rpcCache.getOrFetch(
            `role:${doctorWallet}:${BLOCKCHAIN_ROLE.DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet, BLOCKCHAIN_ROLE.DOCTOR),
            env.RPC_ROLE_TTL // 24h TTL
        ),
    ]);

    if (!isPatientActiveOnChain) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Bệnh nhân chưa được đăng ký vai trò PATIENT trên Blockchain',
        );
    }

    if (!isDoctorActiveOnChain) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Bác sĩ chưa được kích hoạt vai trò DOCTOR trên Blockchain',
        );
    }

    return {
        message: 'Thông tin sẵn sàng, vui lòng ký cấp quyền qua MetaMask',
        contractAddress: dynamicAccessControlContract.target,
        method: 'grantAccess',
        args: [doctorWallet, 24],
        doctorWallet,
        durationHours: 24,
        appointmentId,
    };
};

/**
 * Bước 2: Verify transaction grantAccess
 */
const verifyGrantAccess = async (appointmentId, txHash, currentUser) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');
    }

    // Lấy wallet bác sĩ
    const doctorProfile = await doctorModel.findOneByUserId(appointment.doctorId);
    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    // Lấy wallet bệnh nhân
    const patientUser = await userModel.findById(currentUser._id);
    const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    // Lấy transaction từ blockchain
    const tx = await blockchainProvider.getTransaction(txHash);

    // Validate đúng contract + method + args
    validateContractTransaction({
        tx,
        abi: blockchainAbis.DynamicAccessControl,
        expectedContract: dynamicAccessControlContract.target,
        expectedMethod: 'grantAccess',
        expectedArgs: [doctorWallet, '24'],
    });

    // Đảm bảo tx được ký bởi chính bệnh nhân
    if (tx.from.toLowerCase() !== patientWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Tx không phải do bệnh nhân ký');
    }

    // Chờ transaction được confirm
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        appointment.status = appointmentModel.APPOINTMENT_STATUS.CONFIRMED;
        await appointment.save();

        return {
            message: 'Cấp quyền thành công trên Blockchain',
            appointment,
        };
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Transaction thất bại');
    }
};

/**
 * Bước 3: Chuẩn bị revoke access
 */
const prepareRevokeAccess = async (appointmentId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);
    if (!appointment) throw new ApiError(StatusCodes.NOT_FOUND, 'Lịch hẹn không tồn tại');

    const doctorProfile = await doctorModel.findOneByUserId(appointment.doctorId);
    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    return {
        message: 'Vui lòng ký thu hồi quyền qua MetaMask',
        contractAddress: dynamicAccessControlContract.target,
        method: 'revokeAccess',
        args: [doctorWallet],
        doctorWallet,
        appointmentId,
    };
};

/**
 * Bước 4: Verify revoke access
 */
const verifyRevokeAccess = async (appointmentId, txHash, currentUser) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);

    const doctorProfile = await doctorModel.findOneByUserId(appointment.doctorId);
    const doctorUser = await userModel.findById(doctorProfile.userId);
    const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    const patientUser = await userModel.findById(currentUser._id);
    const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

    const tx = await blockchainProvider.getTransaction(txHash);

    validateContractTransaction({
        tx,
        abi: blockchainAbis.DynamicAccessControl,
        expectedContract: dynamicAccessControlContract.target,
        expectedMethod: 'revokeAccess',
        expectedArgs: [doctorWallet],
    });

    if (tx.from.toLowerCase() !== patientWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Tx không phải do bệnh nhân ký');
    }

    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        return 'Thu hồi quyền thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Transaction thất bại');
    }
};

/**
 * Hủy lịch hẹn
 */
const cancelMyAppointment = async (appointmentId, patientId) => {
    const appointment = await appointmentModel.getAppointmentById(appointmentId);

    if (!appointment) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lịch hẹn');
    }

    // Check quyền
    if (appointment.patientId.toString() !== patientId.toString()) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Không có quyền');
    }

    // Chỉ cho hủy khi pending hoặc confirmed
    if (
        ![appointmentModel.APPOINTMENT_STATUS.PENDING, appointmentModel.APPOINTMENT_STATUS.CONFIRMED].includes(
            appointment.status,
        )
    ) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không thể hủy');
    }

    appointment.status = 'CANCELLED';
    await appointment.save();

    /**
     * Trả metadata revoke access nếu có doctor
     */
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
                message: 'Vui lòng ký MetaMask để thu hồi quyền',
            };
        }
    }

    return {
        message: 'Hủy lịch thành công',
        appointment,
        blockchain: blockchainMetadata,
    };
};

/**
 * Đặt lại lịch
 */
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
        throw new Error('Không thể đặt lại lịch');
    }

    return updated;
};

/**
 * Cập nhật trạng thái (doctor)
 */
const updateStatus = async (appointmentId, payload, userId) => {
    const appointment = await appointmentModel.findOneAndUpdateAppointment(
        { _id: appointmentId },
        {
            ...payload,
            doctorId: userId,
        },
    );

    if (!appointment) throw new ApiError(StatusCodes.BAD_REQUEST, 'Cập nhật thất bại');

    return 'Cập nhật thành công';
};

/**
 * Export service
 */
export const appointmentService = {
    createAppointment,
    getAppointmentsByPatient: async (patientId) => await appointmentModel.getAppointmentsByPatientId(patientId),
    getAppointmentsByDoctor,
    cancelMyAppointment,
    rescheduleMyAppointment,
    getAppointments: async () => await appointmentModel.getAppointments(),
    updateStatus,
    prepareGrantAccess,
    verifyGrantAccess,
    prepareRevokeAccess,
    verifyRevokeAccess,
};