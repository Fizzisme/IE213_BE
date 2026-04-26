import { ethers } from 'ethers';
import { env } from '~/config/environment';

/**
 * Trong kiến trúc Web3 thực thụ, Backend không nên giữ Private Key của người dùng.
 * Backend chỉ đóng vai trò là "Read-only" để truy vấn trạng thái On-chain.
 * Các giao dịch ghi dữ liệu (Write) sẽ được thực hiện từ MetaMask ở Frontend.
 */

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC_URLS = [
    env.BLOCKCHAIN_RPC_URL,
    env.SEPOLIA_RPC_URL,
    'https://rpc.sepolia.org',
    'https://eth-sepolia.public.blastapi.io',
].filter(Boolean);

let currentProviderIndex = 0;
let rpcProvider = null;

/**
 * Khởi tạo Provider với fallback RPC URLs
 */
const initProvider = () => {
    while (currentProviderIndex < SEPOLIA_RPC_URLS.length) {
        try {
            const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URLS[currentProviderIndex]);
            rpcProvider = provider;
            console.log('[Blockchain] Connected to RPC:', SEPOLIA_RPC_URLS[currentProviderIndex]);
            return provider;
        } catch (error) {
            console.warn('[Blockchain] Failed to connect to RPC ' + (currentProviderIndex + 1) + '/' + SEPOLIA_RPC_URLS.length + ':', error.message);
            currentProviderIndex++;
        }
    }
    console.error('[Blockchain] All RPC endpoints failed');
    throw new Error('Cannot connect to any blockchain RPC endpoint');
};

// Khởi tạo provider ban đầu
initProvider();

/**
 * Kiểm tra chainId của transaction có khớp với Sepolia không
 * @param {string} txHash - Transaction hash
 * @returns {Promise<boolean>}
 */
const verifyChain = async (txHash) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    try {
        const tx = await rpcProvider.getTransaction(txHash);
        if (!tx) throw new Error('Transaction not found');

        const network = await rpcProvider.getNetwork();
        if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
            throw new Error('Wrong network: expected Sepolia (' + SEPOLIA_CHAIN_ID + '), got ' + network.chainId);
        }

        return true;
    } catch (error) {
        // Thử với provider khác nếu lỗi
        if (currentProviderIndex < SEPOLIA_RPC_URLS.length - 1) {
            currentProviderIndex++;
            rpcProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URLS[currentProviderIndex]);
            console.log('[Blockchain] Switched to fallback RPC:', SEPOLIA_RPC_URLS[currentProviderIndex]);
            return verifyChain(txHash);
        }
        throw error;
    }
};

/**
 * Đợi transaction receipt với xử lý lỗi chi tiết
 * @param {string} txHash
 * @param {number} confirmations
 * @param {number} timeoutMs
 */
const waitForTransaction = async (txHash, confirmations = 1, timeoutMs = 120000) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    // Kiểm tra chain trước
    await verifyChain(txHash);

    try {
        const receipt = await rpcProvider.waitForTransaction(txHash, confirmations, timeoutMs);

        if (!receipt) {
            throw new Error('Transaction receipt is null - transaction may have been dropped');
        }

        if (receipt.status === 0) {
            const error = new Error('Transaction failed on-chain (status = 0)');
            error.code = 'TRANSACTION_REVERTED';
            error.txHash = txHash;
            throw error;
        }

        return receipt;
    } catch (error) {
        // Phân loại lỗi chi tiết
        if (error.code === 'TIMEOUT') {
            const timeoutError = new Error('Transaction confirmation timeout - check network congestion');
            timeoutError.code = 'CONFIRMATION_TIMEOUT';
            timeoutError.txHash = txHash;
            throw timeoutError;
        }

        if (error.code === 'NETWORK_ERROR' || error.code === 'SERVER_ERROR') {
            // Thử fallback RPC
            if (currentProviderIndex < SEPOLIA_RPC_URLS.length - 1) {
                currentProviderIndex++;
                rpcProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URLS[currentProviderIndex]);
                console.log('[Blockchain] RPC error, switched to fallback:', SEPOLIA_RPC_URLS[currentProviderIndex]);
                return waitForTransaction(txHash, confirmations, timeoutMs);
            }
        }

        if (error.code === 'CALL_EXCEPTION') {
            const rpcError = new Error('RPC call failed - transaction may have been reverted or network is congested');
            rpcError.code = 'RPC_CALL_FAILED';
            rpcError.originalError = error;
            throw rpcError;
        }

        throw error;
    }
};

const getTransaction = async (txHash) => {
    if (!rpcProvider) throw new Error('RPC Provider not initialized');

    await verifyChain(txHash);

    const tx = await rpcProvider.getTransaction(txHash);
    if (!tx) {
        throw new Error('Transaction not found');
    }

    return tx;
};

export const blockchainProvider = {
    rpcProvider,
    verifyChain,
    getTransaction,
    waitForTransaction,
    SEPOLIA_CHAIN_ID,
};

// Export rpcProvider để backward compatible
export { rpcProvider };
