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
        birthYear: payload.dob,
        phoneNumber: payload.phoneNumber,
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

export const patientService = {
    createPatient,
};
