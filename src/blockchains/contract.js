import { ethers } from 'ethers';
import { env } from '~/config/environment';
import { rpcProvider } from './provider';

// Import ABI của các Smart Contract
// ABI dùng để định nghĩa các hàm và cấu trúc dữ liệu của contract
import IdentityManagerABI from './abis/IdentityManager.json';
import DynamicAccessControlABI from './abis/DynamicAccessControl.json';
import MedicalLedgerABI from './abis/MedicalLedger.json';

/**
 * Khởi tạo các instance của Smart Contract ở Backend.
 * 
 * Lưu ý:
 * - Sử dụng rpcProvider => chỉ đọc dữ liệu (read-only)
 * - Không dùng private key => không thể gửi transaction (write)
 * 
 * Mục đích:
 * - Kiểm tra role (vai trò)
 * - Kiểm tra quyền truy cập
 * - Xác minh dữ liệu trên blockchain
 */

export const IdentityManager = new ethers.Contract(
    // Địa chỉ contract lấy từ biến môi trường
    env.IDENTITY_MANAGER_ADDRESS,

    // ABI của contract
    IdentityManagerABI,

    // Provider dùng để kết nối blockchain (chỉ đọc)
    rpcProvider
);

export const DynamicAccessControl = new ethers.Contract(
    env.DYNAMIC_ACCESS_CONTROL_ADDRESS,
    DynamicAccessControlABI,
    rpcProvider
);

export const MedicalLedger = new ethers.Contract(
    env.MEDICAL_LEDGER_ADDRESS,
    MedicalLedgerABI,
    rpcProvider
);

// ==============================
// Alias để tương thích ngược (camelCase)
// ==============================
// Một số code cũ có thể dùng camelCase nên tạo alias để tránh lỗi

export const identityManagerContract = IdentityManager;
export const dynamicAccessControlContract = DynamicAccessControl;
export const medicalLedgerContract = MedicalLedger;

// ==============================
// Gom tất cả contract lại thành 1 object
// ==============================
// Giúp import và sử dụng thuận tiện hơn ở các module khác

export const blockchainContracts = {
    IdentityManager,
    DynamicAccessControl,
    MedicalLedger,
    identityManagerContract,
    dynamicAccessControlContract,
    medicalLedgerContract,
};

// ==============================
// Export ABI để dùng ở nơi khác (ví dụ decode, verify)
// ==============================

export const blockchainAbis = {
    IdentityManager: IdentityManagerABI,
    DynamicAccessControl: DynamicAccessControlABI,
    MedicalLedger: MedicalLedgerABI,
};

// ==============================
// Hàm decode dữ liệu call của contract
// ==============================

export const decodeContractCall = (abi, data) => {
    // Tạo Interface từ ABI
    // Interface giúp parse dữ liệu raw (hex) thành dạng dễ đọc
    const iface = new ethers.Interface(abi);

    // parseTransaction sẽ decode input data của transaction
    // Ví dụ: biết được gọi hàm gì, tham số gì
    return iface.parseTransaction({ data });
};