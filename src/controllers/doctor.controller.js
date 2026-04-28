import { StatusCodes } from 'http-status-codes';
import { doctorService } from '~/services/doctor.service';
// Lấy ra thông tin cá nhân của bác sĩ 
const getMyProfile = async (req, res, next) => {
    try {
        const result = await doctorService.getMyProfile(req.user);

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

export const doctorController = {
    getMyProfile,
};
