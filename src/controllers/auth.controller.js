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
// Controller tạo thông tin bệnh nhân
const createPatient = async (req, res, next) => {
    try {
        const result = await authService.createPatient(req.user, req.body);
        res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
        next(err);
    }
};

export const authController = {
    register,
    loginByWallet,
    loginByNationId,
    createPatient,
};
