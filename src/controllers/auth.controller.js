import { authService } from '~/services/auth.service';
import { StatusCodes } from 'http-status-codes';
import ms from 'ms';
// Controller đăng ký local
const register = async (req, res, next) => {
    try {
        const result = await authService.register(req.body);
        res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
        next(err);
    }
};
// Controller đăng nhập bằng nationId
const loginByNationId = async (req, res, next) => {
    try {
        const result = await authService.loginByNationId(req.body);
        // Trả về 2 cookie
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
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};
// Controller đăng nhập bằng ví
const loginByWallet = async (req, res, next) => {
    try {
        const { walletAddress, signature } = req.body;
        // Phase 1: chưa có signature -> trả nonce
        if (!signature) {
            const nonce = await authService.createWalletNonce(walletAddress);
            return res.status(200).json({ nonce });
        }
        // Phase 2: có signature -> verify login
        const result = await authService.verifyWalletLogin(walletAddress, signature);
        // Trả về 2 cookie
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
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const logout = async (req, res, next) => {
    try {
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(StatusCodes.OK).json('Đăng xuất thành công');
    } catch (error) {
        next(error);
    }
};

export const authController = {
    register,
    loginByWallet,
    loginByNationId,
    logout,
};
