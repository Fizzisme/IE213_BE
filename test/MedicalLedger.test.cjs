const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('MedicalLedger', function () {
    let identityManager, accessControl, medicalLedger;
    let admin, doctor, labTech, patient;
    let doctorAddress, labTechAddress, patientAddress;

    beforeEach(async function () {
        [admin, doctor, labTech, patient] = await ethers.getSigners();
        doctorAddress = doctor.address;
        labTechAddress = labTech.address;
        patientAddress = patient.address;

        // Deploy IdentityManager
        const IdentityManager = await ethers.getContractFactory('IdentityManager');
        identityManager = await IdentityManager.deploy();
        await identityManager.waitForDeployment();

        // Deploy DynamicAccessControl
        const DynamicAccessControl = await ethers.getContractFactory('DynamicAccessControl');
        accessControl = await DynamicAccessControl.deploy(await identityManager.getAddress());
        await accessControl.waitForDeployment();

        // Deploy MedicalLedger
        const MedicalLedger = await ethers.getContractFactory('MedicalLedger');
        medicalLedger = await MedicalLedger.deploy(
            await identityManager.getAddress(),
            await accessControl.getAddress()
        );
        await medicalLedger.waitForDeployment();

        // Register roles
        await identityManager.connect(admin).registerStaff(doctorAddress, 2); // DOCTOR
        await identityManager.connect(admin).registerStaff(labTechAddress, 3); // LAB_TECH

        const message = 'REGISTER_ZUNI_PATIENT';
        const signature = await patient.signMessage(message);
        await identityManager.connect(admin).registerPatientGasless(patientAddress, signature);

        // Grant access from patient to doctor
        await accessControl.connect(patient).grantAccess(doctorAddress, 24);
    });

    describe('createRecord', function () {
        it('Should allow doctor to create record with valid access', async function () {
            const mongoId = '507f1f77bcf86cd799439011';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            await expect(medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 0, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // CREATED = 0

            const record = await medicalLedger.records(mongoId);
            expect(record.patient).to.equal(patientAddress);
            expect(record.creatorDoctor).to.equal(doctorAddress);
            expect(record.recordHash).to.equal(recordHash);
            expect(record.status).to.equal(0); // CREATED
        });

        it('Should revert if non-doctor tries to create record', async function () {
            const mongoId = '507f1f77bcf86cd799439011';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            await expect(
                medicalLedger.connect(patient).createRecord(mongoId, patientAddress, recordHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if doctor has no access', async function () {
            // Register another doctor without access
            const [, , , , otherDoctor] = await ethers.getSigners();
            await identityManager.connect(admin).registerStaff(otherDoctor.address, 2);

            const mongoId = '507f1f77bcf86cd799439012';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            await expect(
                medicalLedger.connect(otherDoctor).createRecord(mongoId, patientAddress, recordHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'NoAccess');
        });
    });

    describe('appendTestResult', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash;

        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
        });

        it('Should allow lab tech to append test result', async function () {
            await expect(medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 2, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // HAS_RESULT = 2

            const record = await medicalLedger.records(mongoId);
            expect(record.status).to.equal(2); // HAS_RESULT

            // Verify hash chaining
            const expectedTestResultHash = ethers.keccak256(
                ethers.solidityPacked(['bytes32', 'bytes32'], [recordHash, resultHash])
            );
            expect(record.testResultHash).to.equal(expectedTestResultHash);
        });

        it('Should revert if non-lab-tech tries to append result', async function () {
            await expect(
                medicalLedger.connect(doctor).appendTestResult(mongoId, resultHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if record status is not CREATED or WAITING_RESULT', async function () {
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
            await expect(
                medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'InvalidState');
        });
    });

    describe('closeRecord', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash, diagnosisHash;

        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            diagnosisHash = ethers.keccak256(ethers.toUtf8Bytes('diagnosis-data'));

            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
        });

        it('Should allow creator doctor to close record', async function () {
            await expect(medicalLedger.connect(doctor).closeRecord(mongoId, diagnosisHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 4, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // COMPLETE = 4

            const record = await medicalLedger.records(mongoId);
            expect(record.status).to.equal(4); // COMPLETE
        });

        it('Should revert if non-creator doctor tries to close', async function () {
            const [, , , , otherDoctor] = await ethers.getSigners();
            await identityManager.connect(admin).registerStaff(otherDoctor.address, 2);
            await accessControl.connect(patient).grantAccess(otherDoctor.address, 24);

            await expect(
                medicalLedger.connect(otherDoctor).closeRecord(mongoId, diagnosisHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if trying to close without test result', async function () {
            const mongoId2 = '507f1f77bcf86cd799439012';
            await medicalLedger.connect(doctor).createRecord(mongoId2, patientAddress, recordHash);

            await expect(
                medicalLedger.connect(doctor).closeRecord(mongoId2, diagnosisHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'InvalidState');
        });
    });

    describe('verifyIntegrity', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash, diagnosisHash;

        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            diagnosisHash = ethers.keccak256(ethers.toUtf8Bytes('diagnosis-data'));

            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
            await medicalLedger.connect(doctor).closeRecord(mongoId, diagnosisHash);
        });

        it('Should verify record hash correctly', async function () {
            expect(await medicalLedger.verifyIntegrity(mongoId, recordHash, 0)).to.equal(true);
            expect(await medicalLedger.verifyIntegrity(mongoId, ethers.keccak256(ethers.toUtf8Bytes('tampered')), 0)).to.equal(false);
        });

        it('Should verify test result hash correctly', async function () {
            expect(await medicalLedger.verifyIntegrity(mongoId, resultHash, 1)).to.equal(true);
        });

        it('Should verify diagnosis hash correctly', async function () {
            expect(await medicalLedger.verifyIntegrity(mongoId, diagnosisHash, 2)).to.equal(true);
        });

        it('Should return false for invalid hashType', async function () {
            expect(await medicalLedger.verifyIntegrity(mongoId, recordHash, 99)).to.equal(false);
        });
    });
});
