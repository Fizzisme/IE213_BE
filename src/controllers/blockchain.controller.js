import { StatusCodes } from 'http-status-codes';
import { getBlockchainHealthSnapshot } from '~/blockchain/contract';
// Kiểm tra contract đã deploy đúng địa chỉ, ABI có khớp không, quyền admin còn ko, wiring 
// giữa các contract
const health = async (req, res, next) => {
    try {
        const data = await getBlockchainHealthSnapshot();
        const statusCode = data.status === 'ready' ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;
        return res.status(statusCode).json(data);
    } catch (error) {
        return next(error);
    }
};

export const blockchainController = {
    health,
};
