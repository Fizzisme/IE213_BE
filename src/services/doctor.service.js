import { userModel } from '~/models/user.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { doctorModel } from '~/models/doctor.model';

const getMyProfile = async (user) => {
    // Kiểm tra xem đã có tài khoản chưa
    const userExisted = await userModel.findById(user._id);
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có tài khoản');
    //  kiểm tra tài khoản đã có hồ sơ bác sĩ chưa
    const doctor = await doctorModel.findOneByUserId(userExisted._id);
    if (!doctor) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có hồ sơ bác sĩ');
    // Lấy các thông tin cần trả về
    // const { _id, userId, fullName, gender, birthYear, phoneNumber, createdAt } = labTech;

    return {
        fullName: doctor.fullName,
        gender: doctor.gender,
        specialization: doctor.specialization,
        hospital: doctor.hospital,
        birtYear: doctor.bithYear,
        licenseNumber: doctor.licenseNumber,
        email: doctor.email,
        status: doctor.status,
        phoneNumber: doctor.phoneNumber,
        createdAt: doctor.createdAt,
    };
};

export const doctorService = {
    getMyProfile,
};
