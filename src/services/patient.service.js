import { auditLogModel } from '~/models/auditLog.model';
import { patientModel } from '~/models/patient.model';
import { StatusCodes } from 'http-status-codes';
import { userModel } from '~/models/user.model';
import ApiError from '~/utils/ApiError';

// Hàm tạo thông tin bệnh nhân
const createPatient = async (user, payload) => {
    // ✅ [MEDIUM FIX #3] Check if profile already exists (prevent duplicates)
    const existingPatient = await patientModel.findByUserId(user._id);
    if (existingPatient) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Bạn đã có hồ sơ bệnh nhân. Không thể tạo profile lần thứ 2'
        );
    }

    // Tìm người dùng trong DB
    const userExisted = await userModel.findById(user._id);
    // Nếu người dùng không tồn tại thì ném ra lỗi
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng chưa tồn tại');

    // ✅ [MEDIUM FIX #3] Check user status is ACTIVE (prevent inactive users creating profiles)
    if (userExisted.status !== 'ACTIVE') {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Tài khoản của bạn hiện tại là ${userExisted.status}. Chỉ tài khoản ACTIVE có thể tạo hồ sơ`
        );
    }

    // Tạo patient sau khi tạo người dùng có tài khoản
    const patient = await patientModel.createNew({
        userId: userExisted._id,
        gender: payload.gender,
        birthYear: payload.dob,
    });
    // Cập nhật user đã có profile
    await userModel.updateById(patient.userId, {
        hasProfile: true,
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: userExisted._id,
        action: 'CREATE_PATIENT',
        entityType: 'PATIENT',
        entityId: patient._id,
    });
    return {
        patientId: patient._id,
    };
};

// Hàm lấy profile của chính mình
const getMyProfile = async (user) => {
    // Kiểm tra xem đã có tài khoản chưa
    const userExisted = await userModel.findById(user._id);
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có tài khoản');
    //  kiểm tra tài khoản đã có hồ sơ bệnh nhân chưa
    const patient = await patientModel.findByUserId(userExisted._id);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có hồ sơ bệnh nhân');
    // //  Lấy các thông tin cần trả về
    // const { _id, userId, fullName, gender, birthYear, phoneNumber, createdAt } = patient;

    return patient;
};

const getAll = async () => {
    return await patientModel.getAll();
};

const getPatientById = async (patientId) => {
    const patient = await patientModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh nhân');
    return patient;
};

// Lấy danh sách lab orders của bệnh nhân hiện tại (nhóm theo status)
const getMyLabOrders = async (user, query = {}) => {
    // Lấy thông tin bệnh nhân từ userId
    const patient = await patientModel.findByUserId(user._id);
    if (!patient) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh nhân');
    }

    // Import labOrderModel để query
    const { labOrderModel } = await import('~/models/labOrder.model');

    // Lấy wallet address từ user
    const userInfo = await userModel.findById(user._id);
    if (!userInfo) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy thông tin user');
    }

    const patientAddress = userInfo.authProviders?.find(p => p.walletAddress)?.walletAddress?.toLowerCase();
    if (!patientAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa có wallet address');
    }

    // Query lab orders của bệnh nhân
    const labOrders = await labOrderModel.LabOrderModel.find({
        patientAddress: patientAddress.toLowerCase(),
    })
        .populate('relatedMedicalRecordId', 'diagnosis status')
        .sort({ createdAt: -1 })
        .lean();

    // Nhóm theo status để frontend dễ xử lý
    const grouped = {
        pendingConsent: [],    // ORDERED
        inProgress: [],        // CONSENTED, IN_PROGRESS
        completed: [],         // RESULT_POSTED, DOCTOR_REVIEWED, COMPLETE
    };

    labOrders.forEach((order) => {
        const status = order.sampleStatus;
        if (status === 'ORDERED') {
            grouped.pendingConsent.push(order);
        } else if (status === 'CONSENTED' || status === 'IN_PROGRESS') {
            grouped.inProgress.push(order);
        } else if (
            status === 'RESULT_POSTED' ||
            status === 'DOCTOR_REVIEWED' ||
            status === 'COMPLETE'
        ) {
            grouped.completed.push(order);
        }
    });

    return {
        data: grouped,
        total: labOrders.length,
        summary: {
            pendingConsent: grouped.pendingConsent.length,
            inProgress: grouped.inProgress.length,
            completed: grouped.completed.length,
        },
    };
};

// Lấy danh sách medical records của bệnh nhân hiện tại
const getMyMedicalRecords = async (user) => {
    // Lấy thông tin bệnh nhân
    const patient = await patientModel.findByUserId(user._id);
    if (!patient) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh nhân');
    }

    // Import medicalRecordModel để query
    const { medicalRecordModel } = await import('~/models/medicalRecord.model');

    // Query medical records của bệnh nhân
    const records = await medicalRecordModel.findByPatientId(patient._id);

    // Nếu không có function findByPatientId, dùng find trực tiếp
    const allRecords = await medicalRecordModel.collection
        .find({ patientId: patient._id })
        .sort({ createdAt: -1 });

    return {
        data: allRecords,
        total: allRecords.length,
    };
};

export const patientService = {
    createPatient,
    getAll,
    getPatientById,
    getMyProfile,
    getMyLabOrders,
    getMyMedicalRecords,
};
