import { ethers } from 'ethers';
import { env } from '~/config/environment';
import { rpcProvider } from './provider';

// Import ABIs
import IdentityManagerABI from './abis/IdentityManager.json';
import DynamicAccessControlABI from './abis/DynamicAccessControl.json';
import MedicalLedgerABI from './abis/MedicalLedger.json';

/**
 * Các Contract instances ở Backend sử dụng rpcProvider (Chỉ đọc).
 * Dùng để kiểm tra vai trò, quyền truy cập và xác minh tính toàn vẹn (Verify integrity).
 * Tên biến khớp với tên Smart Contract trong Solidity.
 */

export const IdentityManager = new ethers.Contract(
    env.IDENTITY_MANAGER_ADDRESS,
    IdentityManagerABI,
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

// Alias backward-compatible (camelCase)
export const identityManagerContract = IdentityManager;
export const dynamicAccessControlContract = DynamicAccessControl;
export const medicalLedgerContract = MedicalLedger;

export const blockchainContracts = {
    IdentityManager,
    DynamicAccessControl,
    MedicalLedger,
    identityManagerContract,
    dynamicAccessControlContract,
    medicalLedgerContract,
};

export const blockchainAbis = {
    IdentityManager: IdentityManagerABI,
    DynamicAccessControl: DynamicAccessControlABI,
    MedicalLedger: MedicalLedgerABI,
};

export const decodeContractCall = (abi, data) => {
    const iface = new ethers.Interface(abi);
    return iface.parseTransaction({ data });
};



