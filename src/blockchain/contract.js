import { ethers } from 'ethers';
import { env } from '~/config/environment';
import { provider, adminWallet, patientWallet, doctorWallet, labTechWallet } from '~/blockchain/provider';
import AccountManagerAbi from '~/blockchain/abis/AccountManager.json';
import AccessControlAbi from '~/blockchain/abis/AccessControl.json';
import EHRManagerAbi from '~/blockchain/abis/EHRManager.json';
// ===================== Module kết nối và kiểm tra Blockchain ======================

// validateAddress:
// - Dùng để kiểm tra các địa chỉ contract lấy từ biến môi trường.
// - Nếu thiếu hoặc sai định dạng địa chỉ EVM thì dừng hệ thống ngay (fail-fast)
//   để tránh lỗi khó debug ở các bước gọi contract phía sau.
const validateAddress = (name, address) => {
    if (!address || !ethers.isAddress(address)) {
        throw new Error(`Missing or invalid env: ${name}`);
    }
};

validateAddress('ACCOUNT_MANAGER_ADDRESS', env.ACCOUNT_MANAGER_ADDRESS);
validateAddress('ACCESS_CONTROL_ADDRESS', env.ACCESS_CONTROL_ADDRESS);
validateAddress('EHR_MANAGER_ADDRESS', env.EHR_MANAGER_ADDRESS);

const accountManager = new ethers.Contract(env.ACCOUNT_MANAGER_ADDRESS, AccountManagerAbi, provider);
const accessControl = new ethers.Contract(env.ACCESS_CONTROL_ADDRESS, AccessControlAbi, provider);
const ehrManager = new ethers.Contract(env.EHR_MANAGER_ADDRESS, EHRManagerAbi, provider);

// Nhóm contract dùng để ĐỌC dữ liệu (provider read-only).
const accountManagerAdmin = accountManager.connect(adminWallet);
const accessControlAdmin = accessControl.connect(adminWallet);
const ehrManagerAdmin = ehrManager.connect(adminWallet);

// Nhóm contract dùng để gọi giao dịch cần chữ ký admin (signer = adminWallet).
// Lưu ý: các hàm nonpayable/payable khi gọi sẽ tiêu tốn gas.

// ⭐ Test Patient Contracts — dùng cho testing patient operations
// Chỉ dùng trong development/testing!
// Production: Frontend sẽ ký bằng MetaMask
let accessControlPatient = null;
let ehrManagerPatient = null;

if (patientWallet) {
    try {
        accessControlPatient = accessControl.connect(patientWallet);
        ehrManagerPatient = ehrManager.connect(patientWallet);
        console.log('✅ Test Patient AccessControl connected');
        console.log('✅ Test Patient EHRManager connected');
    } catch (error) {
        console.warn('⚠️  Failed to connect patient wallet to contracts:', error.message);
    }
}

// ⭐ Test Doctor Contracts — dùng cho testing doctor operations (create lab order)
// Chỉ dùng trong development/testing!
let ehrManagerDoctor = null;

if (doctorWallet) {
    try {
        ehrManagerDoctor = ehrManager.connect(doctorWallet);
        console.log('✅ Test Doctor EHRManager connected');
    } catch (error) {
        console.warn('⚠️  Failed to connect doctor wallet to contracts:', error.message);
    }
}

// ⭐ Test Lab Tech Contracts — dùng cho testing lab tech operations (receive order, post result)
// Chỉ dùng trong development/testing!
let ehrManagerLabTech = null;

if (labTechWallet) {
    try {
        ehrManagerLabTech = ehrManager.connect(labTechWallet);
        console.log('✅ Test Lab Tech EHRManager connected');
    } catch (error) {
        console.warn('⚠️  Failed to connect lab tech wallet to contracts:', error.message);
    }
}

// hasFunction:
// - Kiểm tra ABI hiện tại có chứa function signature mong đợi hay không.
// - Mục đích: phát hiện sớm trường hợp ABI sai file hoặc ABI cũ không tương thích.
const hasFunction = (contract, signature) => {
    try {
        contract.interface.getFunction(signature);
        return true;
    } catch {
        return false;
    }
};

// getCodeStatus:
// - Đọc bytecode tại một địa chỉ.
// - Nếu trả về '0x' nghĩa là địa chỉ đó chưa deploy contract hoặc sai mạng.
const getCodeStatus = async (address) => {
    const code = await provider.getCode(address);
    return code && code !== '0x';
};

// getBlockchainHealthSnapshot:
// - Hàm tổng hợp tình trạng "sẵn sàng tích hợp blockchain" của hệ thống.
// - Trả về một snapshot chi tiết để API health có thể hiển thị rõ lỗi ở từng bước.
// - Bao gồm các nhóm kiểm tra chính:
//   1) Kết nối mạng RPC và chainId.
//   2) Trạng thái deploy của 3 contract.
//   3) Mức độ tương thích ABI.
//   4) Quyền admin theo ví đang cấu hình.
//   5) Wiring giữa EHRManager -> AccountManager/AccessControl.
const getBlockchainHealthSnapshot = async () => {
    // Lấy thông tin mạng hiện tại từ RPC node.
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    // Xác minh 3 địa chỉ contract có tồn tại bytecode thật trên chain.
    const accountManagerDeployed = await getCodeStatus(env.ACCOUNT_MANAGER_ADDRESS);
    const accessControlDeployed = await getCodeStatus(env.ACCESS_CONTROL_ADDRESS);
    const ehrManagerDeployed = await getCodeStatus(env.EHR_MANAGER_ADDRESS);

    // Bộ kiểm tra nền tảng (hạ tầng + ABI).
    const checks = {
        rpcReachable: true,
        chainIdMatched: Number(network.chainId) === Number(env.CHAIN_ID),
        accountManagerDeployed,
        accessControlDeployed,
        ehrManagerDeployed,
        accountManagerAbiCompatible: hasFunction(accountManager, 'isAdmin(address)'),
        accessControlAbiCompatible: hasFunction(accessControl, 'checkAccessLevel(address,address,uint8)'),
        ehrManagerAbiCompatible: hasFunction(ehrManager, 'nextRecordId()'),
    };

    // Kiểm tra ví admin trong env có đang là admin theo contract hay không.
    const adminChecks = {
        adminAddressFromEnv: adminWallet.address,
        isAdminByContract: null,
        errors: [],
    };

    try {
        if (checks.accountManagerAbiCompatible) {
            adminChecks.isAdminByContract = await accountManager.isAdmin(adminWallet.address);
        }
    } catch (error) {
        adminChecks.errors.push(error.message);
    }

    // Kiểm tra wiring trong EHRManager có trỏ đúng địa chỉ contract phụ thuộc.
    const wiring = {
        ehrHasExpectedAccountManager: null,
        ehrHasExpectedAccessControl: null,
        errors: [],
    };

    try {
        if (hasFunction(ehrManager, 'accountManager()')) {
            const wiredAccountManager = await ehrManager.accountManager();
            wiring.ehrHasExpectedAccountManager =
                wiredAccountManager.toLowerCase() === env.ACCOUNT_MANAGER_ADDRESS.toLowerCase();
        }

        if (hasFunction(ehrManager, 'accessControl()')) {
            const wiredAccessControl = await ehrManager.accessControl();
            wiring.ehrHasExpectedAccessControl =
                wiredAccessControl.toLowerCase() === env.ACCESS_CONTROL_ADDRESS.toLowerCase();
        }
    } catch (error) {
        wiring.errors.push(error.message);
    }

    // Đánh giá tổng quan "ready/not-ready" dựa trên toàn bộ điều kiện cốt lõi.
    const allGood =
        checks.rpcReachable &&
        checks.chainIdMatched &&
        checks.accountManagerDeployed &&
        checks.accessControlDeployed &&
        checks.ehrManagerDeployed &&
        checks.accountManagerAbiCompatible &&
        checks.accessControlAbiCompatible &&
        checks.ehrManagerAbiCompatible &&
        wiring.ehrHasExpectedAccountManager !== false &&
        wiring.ehrHasExpectedAccessControl !== false;

    // Trả về snapshot đầy đủ để frontend hoặc Swagger hiển thị chi tiết theo từng nhóm.
    return {
        status: allGood ? 'ready' : 'not-ready',
        network: {
            name: network.name,
            chainId: Number(network.chainId),
            expectedChainId: Number(env.CHAIN_ID),
            blockNumber,
        },
        contracts: {
            accountManager: env.ACCOUNT_MANAGER_ADDRESS,
            accessControl: env.ACCESS_CONTROL_ADDRESS,
            ehrManager: env.EHR_MANAGER_ADDRESS,
        },
        checks,
        adminChecks,
        wiring,
    };
};

// Export đối tượng dùng chung cho toàn bộ hệ thống blockchain:
// - read: chỉ đọc chain
// - admin: gọi các hàm cần ký bằng ví admin
// - patient: gọi các hàm cần ký bằng ví patient (test wallet)
// - doctor: gọi các hàm cần ký bằng ví doctor (test wallet)
// - labTech: gọi các hàm cần ký bằng ví lab tech (test wallet)
// - provider/adminWallet: phục vụ các use case đặc thù khác
export const blockchainContracts = {
    read: {
        accountManager,
        accessControl,
        ehrManager,
    },
    admin: {
        accountManager: accountManagerAdmin,
        accessControl: accessControlAdmin,
        ehrManager: ehrManagerAdmin,
    },
    patient: {
        accessControl: accessControlPatient,  // ← For testing patient operations (grant access)
        ehrManager: ehrManagerPatient,  // ← For testing patient operations (consent order)
    },
    doctor: {
        ehrManager: ehrManagerDoctor,  // ← For testing doctor operations (create lab order)
    },
    labTech: {
        ehrManager: ehrManagerLabTech,  // ← For testing lab tech operations (receive order, post result)
    },
    provider,
    adminWallet,
    patientWallet,
    doctorWallet,
    labTechWallet,
};

export { getBlockchainHealthSnapshot };
