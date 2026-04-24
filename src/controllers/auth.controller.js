import { authService } from '~/services/auth.service';
import { StatusCodes } from 'http-status-codes';
import ms from 'ms';

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
// Hàm có tác dung refresh access token khi access token hết hạn (vẫn còn refresh token hợp lệ)
const refreshAccessToken = async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        const result = await authService.refreshAccessToken(refreshToken);

        // Set new accessToken cookie (refreshToken stays the same)
        res.cookie('accessToken', result.accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ms('20 minutes'),
        });

        return res.status(StatusCodes.OK).json({
            accessToken: result.accessToken,
            status: result.status,
            expiresIn: result.expiresIn,
            message: 'Access token refreshed successfully',
        });
    } catch (error) {
        next(error);
    }
};

export const authController = {
    loginByWallet,
    loginByNationId,
    logout,
    refreshAccessToken,
};
