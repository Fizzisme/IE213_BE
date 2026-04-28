/**
 * Script deploy 3 Smart Contracts:
 * 1. IdentityManager
 * 2. DynamicAccessControl
 * 3. MedicalLedger
 *
 * Chạy: npx hardhat run scripts/deploy.js --network sepolia
 */

// Import Hardhat Runtime Environment (hre)
// hre cung cấp các API như ethers, network, artifacts...
const hre = require('hardhat');

async function main() {
    // Lấy danh sách account (signer) từ Hardhat
    // deployer là ví dùng để deploy contract
    const [deployer] = await hre.ethers.getSigners();

    // In ra địa chỉ ví deploy và số dư hiện tại
    console.log('Deploying contracts with the account:', deployer.address);
    console.log(
        'Account balance:',
        (await deployer.provider.getBalance(deployer.address)).toString()
    );

    // ==============================
    // 1. Deploy IdentityManager
    // ==============================

    // Lấy factory (bản thiết kế) của contract IdentityManager
    const IdentityManager = await hre.ethers.getContractFactory('IdentityManager');

    // Thực hiện deploy contract lên blockchain
    const identityManager = await IdentityManager.deploy();

    // Chờ transaction deploy được xác nhận (contract được tạo thành công)
    await identityManager.waitForDeployment();

    // Lấy địa chỉ contract sau khi deploy
    const identityManagerAddress = await identityManager.getAddress();

    console.log('IdentityManager deployed to:', identityManagerAddress);

    // ==============================
    // 2. Deploy DynamicAccessControl
    // ==============================

    // Contract này cần truyền vào địa chỉ IdentityManager (dependency)
    const DynamicAccessControl = await hre.ethers.getContractFactory('DynamicAccessControl');

    const dynamicAccessControl = await DynamicAccessControl.deploy(identityManagerAddress);

    await dynamicAccessControl.waitForDeployment();

    const dynamicAccessControlAddress = await dynamicAccessControl.getAddress();

    console.log('DynamicAccessControl deployed to:', dynamicAccessControlAddress);

    // ==============================
    // 3. Deploy MedicalLedger
    // ==============================

    // Contract này phụ thuộc cả IdentityManager và DynamicAccessControl
    const MedicalLedger = await hre.ethers.getContractFactory('MedicalLedger');

    const medicalLedger = await MedicalLedger.deploy(
        identityManagerAddress,
        dynamicAccessControlAddress
    );

    await medicalLedger.waitForDeployment();

    const medicalLedgerAddress = await medicalLedger.getAddress();

    console.log('MedicalLedger deployed to:', medicalLedgerAddress);

    // ==============================
    // Lưu thông tin deploy ra file JSON
    // ==============================

    // Tạo object chứa toàn bộ thông tin deploy
    const deploymentInfo = {
        // Tên network (ví dụ: sepolia, localhost...)
        network: hre.network.name,

        // Chain ID của mạng blockchain
        chainId: (await deployer.provider.getNetwork()).chainId.toString(),

        // Địa chỉ ví deploy
        deployer: deployer.address,

        // Danh sách contract đã deploy
        contracts: {
            IdentityManager: identityManagerAddress,
            DynamicAccessControl: dynamicAccessControlAddress,
            MedicalLedger: medicalLedgerAddress,
        },

        // Thời gian deploy
        deployedAt: new Date().toISOString(),
    };

    // Import module fs để ghi file
    const fs = require('fs');

    // Ghi file deployment.json (format đẹp với indent = 2)
    fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));

    console.log('\nDeployment info saved to deployment.json');

    // ==============================
    // In ra hướng dẫn cập nhật .env
    // ==============================

    console.log('\n--- UPDATE YOUR .ENV ---');
    console.log(`IDENTITY_MANAGER_ADDRESS=${identityManagerAddress}`);
    console.log(`DYNAMIC_ACCESS_CONTROL_ADDRESS=${dynamicAccessControlAddress}`);
    console.log(`MEDICAL_LEDGER_ADDRESS=${medicalLedgerAddress}`);
}

// Chạy hàm main
main()
    .then(() => process.exit(0)) // Thành công -> thoát với code 0
    .catch((error) => {
        // Nếu có lỗi -> log lỗi và thoát với code 1
        console.error(error);
        process.exit(1);
    });