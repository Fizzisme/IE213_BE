import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { decodeContractCall } from '~/blockchains/contract';

// Chuẩn hóa giá trị trước khi so sánh để tránh lệch kiểu giữa dữ liệu mong đợi và dữ liệu decode từ calldata.
const normalizeArg = (value) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') {
        if (/^0x[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
        if (/^0x[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase();
        return value;
    }
    if (value && typeof value === 'object' && 'toString' in value) {
        return value.toString();
    }
    return String(value);
};

export const validateContractTransaction = ({ tx, abi, expectedContract, expectedMethod, expectedArgs = [] }) => {
    // 1. Tx phải được gửi tới đúng smart contract backend đang mong đợi.
    if (!tx?.to || tx.to.toLowerCase() !== expectedContract.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch không được gửi tới đúng smart contract yêu cầu');
    }

    let parsed;
    try {
        // 2. Giải mã calldata để biết tx đang gọi hàm gì và truyền tham số gì.
        parsed = decodeContractCall(abi, tx.data);
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không thể giải mã calldata của giao dịch blockchain');
    }

    // 3. Sau khi decode, tên hàm phải khớp đúng method mà backend yêu cầu.
    if (!parsed || parsed.name !== expectedMethod) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch không gọi đúng hàm ${expectedMethod}`);
    }

    // 4. So khớp lần lượt từng tham số để chặn trường hợp tx đúng method nhưng sai dữ liệu nghiệp vụ.
    expectedArgs.forEach((expectedArg, index) => {
        const actualArg = parsed.args[index];
        if (normalizeArg(actualArg) !== normalizeArg(expectedArg)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Tham số giao dịch blockchain không khớp tại vị trí ${index}`);
        }
    });

    // 5. Trả parsed call để caller có thể dùng tiếp nếu cần debug hoặc xử lý sâu hơn.
    return parsed;
};
