const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DynamicAccessControl', function () {
    let identityManager, accessControl;
    let admin, doctor, patient, otherDoctor;

    beforeEach(async function () {
        [admin, doctor, patient, otherDoctor] = await ethers.getSigners();

        // Deploy IdentityManager first
        const IdentityManager = await ethers.getContractFactory('IdentityManager');
        identityManager = await IdentityManager.deploy();
        await identityManager.waitForDeployment();

        // Deploy DynamicAccessControl
        const DynamicAccessControl = await ethers.getContractFactory('DynamicAccessControl');
        accessControl = await DynamicAccessControl.deploy(await identityManager.getAddress());
        await accessControl.waitForDeployment();

        // Register doctor
        await identityManager.connect(admin).registerStaff(doctor.address, 2); // Role.DOCTOR = 2
        await identityManager.connect(admin).registerStaff(otherDoctor.address, 2);

        // Register patient gaslessly
        const message = 'REGISTER_ZUNI_PATIENT';
        const signature = await patient.signMessage(message);
        await identityManager.connect(admin).registerPatientGasless(patient.address, signature);
    });

    describe('grantAccess', function () {
        it('Should allow patient to grant access to doctor', async function () {
            const duration = 24;
            await expect(accessControl.connect(patient).grantAccess(doctor.address, duration))
                .to.emit(accessControl, 'AccessGranted')
                .withArgs(patient.address, doctor.address, await ethers.provider.getBlock('latest').then(b => b.timestamp + 24 * 3600));

            const token = await accessControl.accessTokens(patient.address, doctor.address);
            expect(token.isGranted).to.equal(true);
            expect(token.expiresAt).to.be.gt(0);
        });

        it('Should revert if non-patient tries to grant access', async function () {
            await expect(
                accessControl.connect(doctor).grantAccess(otherDoctor.address, 24)
            ).to.be.revertedWithCustomError(accessControl, 'NotPatient');
        });

        it('Should revert if granting access to non-doctor', async function () {
            await expect(
                accessControl.connect(patient).grantAccess(patient.address, 24)
            ).to.be.revertedWithCustomError(accessControl, 'DoctorNotActive');
        });
    });

    describe('revokeAccess', function () {
        it('Should allow patient to revoke access', async function () {
            await accessControl.connect(patient).grantAccess(doctor.address, 24);

            await expect(accessControl.connect(patient).revokeAccess(doctor.address))
                .to.emit(accessControl, 'AccessRevoked')
                .withArgs(patient.address, doctor.address);

            const token = await accessControl.accessTokens(patient.address, doctor.address);
            expect(token.isGranted).to.equal(false);
        });

        it('Should revert if non-patient tries to revoke', async function () {
            await expect(
                accessControl.connect(doctor).revokeAccess(otherDoctor.address)
            ).to.be.revertedWithCustomError(accessControl, 'NotPatient');
        });
    });

    describe('canAccess', function () {
        it('Should return true when access is valid', async function () {
            await accessControl.connect(patient).grantAccess(doctor.address, 24);
            expect(await accessControl.canAccess(patient.address, doctor.address)).to.equal(true);
        });

        it('Should return false when access is revoked', async function () {
            await accessControl.connect(patient).grantAccess(doctor.address, 24);
            await accessControl.connect(patient).revokeAccess(doctor.address);
            expect(await accessControl.canAccess(patient.address, doctor.address)).to.equal(false);
        });

        it('Should return false when access expired', async function () {
            await accessControl.connect(patient).grantAccess(doctor.address, 1); // 1 hour

            // Fast forward 2 hours
            await ethers.provider.send('evm_increaseTime', [2 * 3600]);
            await ethers.provider.send('evm_mine');

            expect(await accessControl.canAccess(patient.address, doctor.address)).to.equal(false);
        });

        it('Should return false for never-granted access', async function () {
            expect(await accessControl.canAccess(patient.address, otherDoctor.address)).to.equal(false);
        });
    });
});
