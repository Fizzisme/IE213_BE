import { ethers } from 'ethers';
import { env } from '~/config/environment';

/**
 * Trong kiến trúc Web3 chuẩn:
 * - Backend KHÔNG giữ private key của user
 * - Backend chỉ dùng để đọc dữ liệu (read-only)
 * - Việc gửi transaction (write) phải do frontend (MetaMask) thực hiện
 */

// ChainId của mạng Sepolia
const SEPOLIA_CHAIN_ID = 11155111;

// Danh sách RPC endpoint (có fallback)
// filter(Boolean) để loại bỏ giá trị undefined/null
const SEPOLIA_RPC_URLS = [
    env.BLOCKCHAIN_RPC_URL,
    env.SEPOLIA_RPC_URL,
    'https://rpc.sepolia.org',
    'https://eth-sepolia.public.blastapi.io',
].filter(Boolean);

// Index của RPC hiện tại đang dùng
let currentProviderIndex = 0;

// Biến lưu provider hiện tại
let rpcProvider = null;

/**
 * Hàm khởi tạo provider
 * Thử lần lượt từng RPC URL cho đến khi kết nối thành công
 */
const initProvider = () => {
    while (currentProviderIndex < SEPOLIA_RPC_URLS.length) {
        try {
            // Tạo provider từ RPC URL
            const provider = new ethers.JsonRpcProvider(
                SEPOLIA_RPC_URLS[currentProviderIndex]
            );

            // Gán provider hiện tại
            rpcProvider = provider;

            console.log(
                '[Blockchain] Connected to RPC:',
                SEPOLIA_RPC_URLS[currentProviderIndex]
            );

            return provider;
        } catch (error) {
            // Nếu lỗi thì chuyển sang RPC tiếp theo
            console.warn(
                '[Blockchain] Failed to connect to RPC ' +
                    (currentProviderIndex + 1) +
                    '/' +
                    SEPOLIA_RPC_URLS.length +
                    ':',
                error.message
            );

            currentProviderIndex++;
        }
    }

    // Nếu tất cả RPC đều fail
    console.error('[Blockchain] All RPC endpoints failed');
    throw new Error('Cannot connect to any blockchain RPC endpoint');
};

// Khởi tạo provider ngay khi load file
initProvider();

/**
 * Kiểm tra transaction có thuộc đúng mạng Sepolia không
 * @param {string} txHash - hash của transaction
 * @returns {Promise<boolean>}
 */
const verifyChain = async (txHash) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    try {
        // Lấy thông tin transaction
        const tx = await rpcProvider.getTransaction(txHash);

        if (!tx) throw new Error('Transaction not found');

        // Lấy thông tin network hiện tại
        const network = await rpcProvider.getNetwork();

        // So sánh chainId
        if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
            throw new Error(
                'Wrong network: expected Sepolia (' +
                    SEPOLIA_CHAIN_ID +
                    '), got ' +
                    network.chainId
            );
        }

        return true;
    } catch (error) {
        // Nếu lỗi thì thử chuyển sang RPC khác (fallback)
        if (currentProviderIndex < SEPOLIA_RPC_URLS.length - 1) {
            currentProviderIndex++;

            rpcProvider = new ethers.JsonRpcProvider(
                SEPOLIA_RPC_URLS[currentProviderIndex]
            );

            console.log(
                '[Blockchain] Switched to fallback RPC:',
                SEPOLIA_RPC_URLS[currentProviderIndex]
            );

            // Gọi lại hàm với provider mới
            return verifyChain(txHash);
        }

        // Nếu hết RPC thì throw lỗi
        throw error;
    }
};

/**
 * Đợi transaction được xác nhận (có thể cấu hình số block confirm)
 * @param {string} txHash - hash transaction
 * @param {number} confirmations - số block confirm (mặc định 1)
 * @param {number} timeoutMs - thời gian timeout (ms)
 */
const waitForTransaction = async (
    txHash,
    confirmations = 1,
    timeoutMs = 120000
) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    // Kiểm tra transaction có thuộc đúng chain không
    await verifyChain(txHash);

    try {
        // Chờ transaction được mined
        const receipt = await rpcProvider.waitForTransaction(
            txHash,
            confirmations,
            timeoutMs
        );

        // Nếu receipt null (có thể tx bị drop)
        if (!receipt) {
            throw new Error(
                'Transaction receipt is null - transaction may have been dropped'
            );
        }

        // Nếu status = 0 => transaction bị revert
        if (receipt.status === 0) {
            const error = new Error('Transaction failed on-chain (status = 0)');
            error.code = 'TRANSACTION_REVERTED';
            error.txHash = txHash;
            throw error;
        }

        return receipt;
    } catch (error) {
        // Xử lý timeout
        if (error.code === 'TIMEOUT') {
            const timeoutError = new Error(
                'Transaction confirmation timeout - check network congestion'
            );
            timeoutError.code = 'CONFIRMATION_TIMEOUT';
            timeoutError.txHash = txHash;
            throw timeoutError;
        }

        // Nếu lỗi mạng hoặc RPC
        if (
            error.code === 'NETWORK_ERROR' ||
            error.code === 'SERVER_ERROR'
        ) {
            // Thử chuyển RPC khác
            if (currentProviderIndex < SEPOLIA_RPC_URLS.length - 1) {
                currentProviderIndex++;

                rpcProvider = new ethers.JsonRpcProvider(
                    SEPOLIA_RPC_URLS[currentProviderIndex]
                );

                console.log(
                    '[Blockchain] RPC error, switched to fallback:',
                    SEPOLIA_RPC_URLS[currentProviderIndex]
                );

                return waitForTransaction(
                    txHash,
                    confirmations,
                    timeoutMs
                );
            }
        }

        // Nếu lỗi call exception (thường do revert hoặc RPC lỗi)
        if (error.code === 'CALL_EXCEPTION') {
            const rpcError = new Error(
                'RPC call failed - transaction may have been reverted or network is congested'
            );
            rpcError.code = 'RPC_CALL_FAILED';
            rpcError.originalError = error;
            throw rpcError;
        }

        throw error;
    }
};

/**
 * Lấy thông tin transaction
 * @param {string} txHash
 */
const getTransaction = async (txHash) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    // Kiểm tra chain trước khi gọi
    await verifyChain(txHash);

    const tx = await rpcProvider.getTransaction(txHash);

    if (!tx) {
        throw new Error('Transaction not found');
    }

    return tx;
};

/**
 * Export các hàm và config liên quan blockchain
 */
export const blockchainProvider = {
    rpcProvider,
    verifyChain,
    getTransaction,
    waitForTransaction,
    SEPOLIA_CHAIN_ID,
};

// Export riêng rpcProvider để tương thích code cũ
export { rpcProvider };