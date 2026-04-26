import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainProvider } from '~/blockchains/provider';

/**
 * Middleware kiểm tra transaction hash hợp lệ và đúng mạng Sepolia
 * Sử dụng trước các endpoint verify-tx
 */
export const chainCheck = async (req, res, next) => {
    try {
        const { txHash } = req.body;

        if (!txHash || !/^0x([A-Fa-f0-9]{64})$/.test(txHash)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Transaction hash không hợp lệ');
        }

        // Kiểm tra chainId
        await blockchainProvider.verifyChain(txHash);

        next();
    } catch (error) {
        if (error.message.includes('Wrong network')) {
            return next(
                new ApiError(
                    StatusCodes.BAD_REQUEST,
                    `Giao dịch không thuộc mạng Sepolia. Vui lòng chuyển MetaMask sang Sepolia Testnet (Chain ID: ${blockchainProvider.SEPOLIA_CHAIN_ID}).`,
                ),
            );
        }
        if (error.message.includes('Transaction not found')) {
            return next(
                new ApiError(
                    StatusCodes.NOT_FOUND,
                    'Không tìm thấy giao dịch trên blockchain. Có thể do: chưa được broadcast, sai mạng, hoặc RPC đang lag.',
                ),
            );
        }
        next(error);
    }
};
