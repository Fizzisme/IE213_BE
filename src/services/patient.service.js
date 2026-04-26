import { auditLogModel } from '~/models/auditLog.model';
import { patientModel } from '~/models/patient.model';
import { StatusCodes } from 'http-status-codes';
import { userModel } from '~/models/user.model';
import ApiError from '~/utils/ApiError';

// Hàm tạo thông tin bệnh nhân
const createPatient = async (user, payload) => {
    // Tìm người dùng trong DB
    const userExisted = await userModel.findById(user._id);
    // Nếu người dùng không tồn tại thì ném ra lỗi
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng chưa tồn tại');

    // Tạo patient sau khi tạo người dùng có tài khoản
    const patient = await patientModel.createNew({
        userId: userExisted._id,
        fullName: payload.fullName,
        gender: payload.gender,
        birthYear: payload.birthYear,
        phoneNumber: payload.phoneNumber,
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
    const patient = await patientModel.findByUserId(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh nhân');
    return patient;
};

export const patientService = {
    createPatient,
    getAll,
    getPatientById,
    getMyProfile,
};
