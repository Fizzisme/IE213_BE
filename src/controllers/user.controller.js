// controllers/userController.js
import { StatusCodes } from 'http-status-codes';
import { userService } from '~/services/user.service';

const getMe = async (req, res, next) => {
    try {
        console.log('User từ middleware:', req.user); // Kiểm tra log này ở terminal
        // req.user được middleware isAuthorized đính kèm vào
        // Lưu ý: Tùy vào JwtProvider của bạn mã hóa trường gì (id hay _id)
        const userId = req.user._id;
        if (!userId) {
            console.log('Không tìm thấy _id trong req.user');
        }
        const result = await userService.getMe(userId);

        res.status(StatusCodes.OK).json({
            status: 'success',
            data: result, // Đây chính là userData chứa hasProfile mới nhất
        });
        console.log(result);
    } catch (error) {
        console.log('Lỗi tại Controller:', error); // Thêm dòng này để debug
        next(error);
    }
};

export const userController = {
    getMe,
};
