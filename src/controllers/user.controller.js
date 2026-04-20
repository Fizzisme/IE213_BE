// src/controllers/user.controller.js
import { userService } from '~/services/user.service';
import { StatusCodes } from 'http-status-codes';
// Controller lấy thông tin cá nhân của user hiện tại
const getMyProfile = async (req, res, next) => {
    try {
        const result = await userService.getMyProfile(req.user._id);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};
// Controller cập nhật thông tin cá nhân (không bao gồm password)
const updateMyProfile = async (req, res, next) => {
    try {
        const result = await userService.updateMyProfile(req.user._id, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};
// Controller đổi mật khẩu
const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const result = await userService.changePassword(
            req.user._id,
            oldPassword,
            newPassword
        );
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

export const userController = {
    getMyProfile,
    updateMyProfile,
    changePassword,
};
