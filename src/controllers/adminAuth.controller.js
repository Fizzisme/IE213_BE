import ms from 'ms';
import { StatusCodes } from 'http-status-codes';
import { adminAuthService } from '~/services/adminAuth.service';

// Lưu ý: Admin ko login bằng wallet chỉ login bằng căn cước
const login = async (req, res, next) => {
    try {
        const result = await adminAuthService.login(req.body);

        res.cookie('accessToken', result.accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ms('20 minutes'),
        });

        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ms('14 days'),
        });

        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};


export const adminAuthService = {
    login,
};