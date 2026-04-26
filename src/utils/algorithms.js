import { ethers } from 'ethers';

/**
 * Tạo mã băm Keccak256 cho dữ liệu truyền vào.
 * @param {Object} data - Dữ liệu cần băm.
 * @returns {string} - Mã băm 32 bytes (hex string).
 */
export const generateDataHash = (data) => {
    // Chuyển object sang chuỗi JSON ổn định và băm
    const content = JSON.stringify(data);
    return ethers.keccak256(ethers.toUtf8Bytes(content));
};

/**
 * So sánh mã băm của dữ liệu hiện tại với mã băm đã lưu trên Blockchain.
 * @param {Object} data - Dữ liệu thực tế từ MongoDB.
 * @param {string} onChainHash - Mã băm lấy từ Smart Contract.
 * @returns {boolean}
 */
export const verifyHash = (data, onChainHash) => {
    const currentHash = generateDataHash(data);
    return currentHash === onChainHash;
};
