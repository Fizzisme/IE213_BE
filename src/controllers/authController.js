import { authService } from '~/services/authService';

const register = async (req, res, next) => {
    try {
        const result = await authService.register(req.body);
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
};

const loginByWallet = async (req, res, next) => {
    try {
        const { walletAddress, signature } = req.body;
        // Phase 1: chua co signature -> tra nonce
        if (!signature) {
            const nonce = await authService.createWalletNonce(walletAddress);
            return res.status(200).json({ nonce });
        }
        // Phase 2: co signature -> verify login
        const result = await authService.verifyWalletLogin(walletAddress, signature);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const authController = {
    register,
    loginByWallet,
};
