/**
 * Script deploy 3 Smart Contracts:
 * 1. IdentityManager
 * 2. DynamicAccessControl
 * 3. MedicalLedger
 *
 * Chạy: npx hardhat run scripts/deploy.js --network sepolia
 */

const hre = require('hardhat');

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log('Deploying contracts with the account:', deployer.address);
    console.log('Account balance:', (await deployer.provider.getBalance(deployer.address)).toString());

    // 1. Deploy IdentityManager
    const IdentityManager = await hre.ethers.getContractFactory('IdentityManager');
    const identityManager = await IdentityManager.deploy();
    await identityManager.waitForDeployment();
    const identityManagerAddress = await identityManager.getAddress();
    console.log('IdentityManager deployed to:', identityManagerAddress);

    // 2. Deploy DynamicAccessControl
    const DynamicAccessControl = await hre.ethers.getContractFactory('DynamicAccessControl');
    const dynamicAccessControl = await DynamicAccessControl.deploy(identityManagerAddress);
    await dynamicAccessControl.waitForDeployment();
    const dynamicAccessControlAddress = await dynamicAccessControl.getAddress();
    console.log('DynamicAccessControl deployed to:', dynamicAccessControlAddress);

    // 3. Deploy MedicalLedger
    const MedicalLedger = await hre.ethers.getContractFactory('MedicalLedger');
    const medicalLedger = await MedicalLedger.deploy(identityManagerAddress, dynamicAccessControlAddress);
    await medicalLedger.waitForDeployment();
    const medicalLedgerAddress = await medicalLedger.getAddress();
    console.log('MedicalLedger deployed to:', medicalLedgerAddress);

    // Lưu địa chỉ vào file JSON để Frontend/Backend sử dụng
    const deploymentInfo = {
        network: hre.network.name,
        chainId: (await deployer.provider.getNetwork()).chainId.toString(),
        deployer: deployer.address,
        contracts: {
            IdentityManager: identityManagerAddress,
            DynamicAccessControl: dynamicAccessControlAddress,
            MedicalLedger: medicalLedgerAddress,
        },
        deployedAt: new Date().toISOString(),
    };

    const fs = require('fs');
    fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
    console.log('\n✅ Deployment info saved to deployment.json');
    console.log('\n--- UPDATE YOUR .ENV ---');
    console.log(`IDENTITY_MANAGER_ADDRESS=${identityManagerAddress}`);
    console.log(`DYNAMIC_ACCESS_CONTROL_ADDRESS=${dynamicAccessControlAddress}`);
    console.log(`MEDICAL_LEDGER_ADDRESS=${medicalLedgerAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
