import { userModel } from '~/models/user.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { labTechModel } from '~/models/labTech.model';

const getMyProfile = async (user) => {
    // Kiểm tra xem đã có tài khoản chưa
    const userExisted = await userModel.findById(user._id);
    if (!userExisted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có tài khoản');
    //  kiểm tra tài khoản đã có hồ sơ bệnh nhân chưa
    const labTech = await labTechModel.findOneByUserId(userExisted._id);
    if (!labTech) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có hồ sơ bệnh nhân');
    // //  Lấy các thông tin cần trả về
    // const { _id, userId, fullName, gender, birthYear, phoneNumber, createdAt } = labTech;

    return labTech;
};

export const labTechService = {
    getMyProfile,
};
