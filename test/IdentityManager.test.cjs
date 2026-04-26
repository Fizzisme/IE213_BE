const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('IdentityManager', function () {
    let identityManager;
    let admin, doctor, labTech, patient;

    beforeEach(async function () {
        [admin, doctor, labTech, patient] = await ethers.getSigners();

        const IdentityManager = await ethers.getContractFactory('IdentityManager');
        identityManager = await IdentityManager.deploy();
        await identityManager.waitForDeployment();
    });

    describe('Deployment', function () {
        it('Should set the deployer as admin', async function () {
            expect(await identityManager.admin()).to.equal(admin.address);
        });

        it('Should auto-register admin with ADMIN role', async function () {
            const account = await identityManager.accounts(admin.address);
            expect(account.role).to.equal(4); // Role.ADMIN = 4
            expect(account.isActive).to.equal(true);
        });
    });

    describe('registerStaff', function () {
        it('Should allow admin to register a doctor', async function () {
            await identityManager.connect(admin).registerStaff(doctor.address, 2); // Role.DOCTOR = 2
            const account = await identityManager.accounts(doctor.address);
            expect(account.role).to.equal(2);
            expect(account.isActive).to.equal(true);
        });

        it('Should allow admin to register a lab tech', async function () {
            await identityManager.connect(admin).registerStaff(labTech.address, 3); // Role.LAB_TECH = 3
            const account = await identityManager.accounts(labTech.address);
            expect(account.role).to.equal(3);
        });

        it('Should revert if non-admin tries to register staff', async function () {
            await expect(
                identityManager.connect(doctor).registerStaff(patient.address, 2)
            ).to.be.revertedWithCustomError(identityManager, 'NotAdmin');
        });

        it('Should revert if registering existing account', async function () {
            await identityManager.connect(admin).registerStaff(doctor.address, 2);
            await expect(
                identityManager.connect(admin).registerStaff(doctor.address, 2)
            ).to.be.revertedWithCustomError(identityManager, 'AccountExists');
        });

        it('Should revert if invalid staff role', async function () {
            await expect(
                identityManager.connect(admin).registerStaff(doctor.address, 1) // PATIENT
            ).to.be.revertedWith('Invalid staff role');
        });
    });

    describe('registerPatientGasless', function () {
        it('Should register patient with valid signature', async function () {
            const message = 'REGISTER_ZUNI_PATIENT';
            const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
            const ethSignedMessageHash = ethers.hashMessage(message);
            const signature = await patient.signMessage(message);

            await identityManager.connect(admin).registerPatientGasless(patient.address, signature);

            const account = await identityManager.accounts(patient.address);
            expect(account.role).to.equal(1); // Role.PATIENT = 1
            expect(account.isActive).to.equal(true);
        });

        it('Should revert with invalid signature', async function () {
            const fakeSignature = '0x' + '00'.repeat(65);
            await expect(
                identityManager.connect(admin).registerPatientGasless(patient.address, fakeSignature)
            ).to.be.revertedWithCustomError(identityManager, 'InvalidSignature');
        });

        it('Should revert if patient already exists', async function () {
            const message = 'REGISTER_ZUNI_PATIENT';
            const signature = await patient.signMessage(message);
            await identityManager.connect(admin).registerPatientGasless(patient.address, signature);

            await expect(
                identityManager.connect(admin).registerPatientGasless(patient.address, signature)
            ).to.be.revertedWithCustomError(identityManager, 'AccountExists');
        });
    });

    describe('hasRole', function () {
        it('Should return true for admin with ADMIN role', async function () {
            expect(await identityManager.hasRole(admin.address, 4)).to.equal(true);
        });

        it('Should return false for unregistered user', async function () {
            expect(await identityManager.hasRole(patient.address, 1)).to.equal(false);
        });
    });

    describe('transferAdmin', function () {
        it('Should allow admin to transfer admin role', async function () {
            await identityManager.connect(admin).transferAdmin(doctor.address);
            expect(await identityManager.admin()).to.equal(doctor.address);
        });

        it('Should revert if non-admin tries to transfer', async function () {
            await expect(
                identityManager.connect(doctor).transferAdmin(patient.address)
            ).to.be.revertedWithCustomError(identityManager, 'NotAdmin');
        });
    });
});
