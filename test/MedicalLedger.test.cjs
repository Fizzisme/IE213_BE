const { expect } = require('chai');
const { ethers } = require('hardhat');

// Bộ kiểm thử cho Smart Contract MedicalLedger.
// Contract này là trung tâm của toàn bộ vòng đời hồ sơ bệnh án trên Blockchain,
// chịu trách nhiệm tạo hồ sơ, ghi nhận kết quả xét nghiệm, đóng hồ sơ sau chẩn đoán,
// và xác minh tính toàn vẹn dữ liệu qua cơ chế Hash-Chaining 3 tầng.
// MedicalLedger phụ thuộc vào IdentityManager (phân quyền) và DynamicAccessControl (kiểm soát truy cập).
describe('MedicalLedger', function () {
    let identityManager, accessControl, medicalLedger;
    let admin, doctor, labTech, patient;
    let doctorAddress, labTechAddress, patientAddress;

    // Thiết lập môi trường sạch trước mỗi test case.
    // Toàn bộ 3 contract được deploy lại từ đầu và các vai trò được đăng ký lại,
    // đảm bảo không có trạng thái nào rò rỉ giữa các test.
    beforeEach(async function () {
        [admin, doctor, labTech, patient] = await ethers.getSigners();
        doctorAddress = doctor.address;
        labTechAddress = labTech.address;
        patientAddress = patient.address;

        // Deploy IdentityManager trước tiên vì hai contract còn lại phụ thuộc vào nó
        const IdentityManager = await ethers.getContractFactory('IdentityManager');
        identityManager = await IdentityManager.deploy();
        await identityManager.waitForDeployment();

        // Deploy DynamicAccessControl với địa chỉ IdentityManager để có thể tra cứu vai trò
        const DynamicAccessControl = await ethers.getContractFactory('DynamicAccessControl');
        accessControl = await DynamicAccessControl.deploy(await identityManager.getAddress());
        await accessControl.waitForDeployment();

        // Deploy MedicalLedger với cả hai địa chỉ contract phụ thuộc
        const MedicalLedger = await ethers.getContractFactory('MedicalLedger');
        medicalLedger = await MedicalLedger.deploy(
            await identityManager.getAddress(),
            await accessControl.getAddress()
        );
        await medicalLedger.waitForDeployment();

        // Đăng ký vai trò cho các tài khoản tham gia kiểm thử
        await identityManager.connect(admin).registerStaff(doctorAddress, 2); // DOCTOR
        await identityManager.connect(admin).registerStaff(labTechAddress, 3); // LAB_TECH

        // Đăng ký bệnh nhân theo luồng Gasless: bệnh nhân ký off-chain, admin nộp lên chain
        const message = 'REGISTER_ZUNI_PATIENT';
        const signature = await patient.signMessage(message);
        await identityManager.connect(admin).registerPatientGasless(patientAddress, signature);

        // Bệnh nhân chủ động cấp quyền truy cập cho bác sĩ trong 24 giờ.
        // Đây là điều kiện tiên quyết để bác sĩ được tạo và xem hồ sơ của bệnh nhân này.
        await accessControl.connect(patient).grantAccess(doctorAddress, 24);
    });

    // Nhóm kiểm thử hàm tạo hồ sơ bệnh án mới trên Blockchain.
    // Chỉ bác sĩ đã được cấp quyền bởi bệnh nhân mới được thực hiện.
    describe('createRecord', function () {
        it('Should allow doctor to create record with valid access', async function () {
            const mongoId = '507f1f77bcf86cd799439011';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            // Sau khi tạo thành công, contract phải phát sự kiện RecordUpdated
            // với trạng thái CREATED (= 0) và timestamp của block hiện tại.
            await expect(medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 0, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // CREATED = 0

            // Xác minh dữ liệu được lưu đúng trên chain
            const record = await medicalLedger.records(mongoId);
            expect(record.patient).to.equal(patientAddress);
            expect(record.creatorDoctor).to.equal(doctorAddress);
            expect(record.recordHash).to.equal(recordHash);
            expect(record.status).to.equal(0); // CREATED
        });

        it('Should revert if non-doctor tries to create record', async function () {
            // Bệnh nhân hoặc bất kỳ vai trò nào khác không được tạo hồ sơ.
            // Ngay cả khi biết đúng tham số, contract phải từ chối vì không đủ quyền.
            const mongoId = '507f1f77bcf86cd799439011';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            await expect(
                medicalLedger.connect(patient).createRecord(mongoId, patientAddress, recordHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if doctor has no access', async function () {
            // Bác sĩ hợp lệ trong hệ thống nhưng chưa được bệnh nhân cấp quyền
            // vẫn phải bị từ chối. Kiểm tra quyền truy cập động (DynamicAccessControl)
            // hoạt động độc lập với việc có vai trò DOCTOR hay không.
            const [, , , , otherDoctor] = await ethers.getSigners();
            await identityManager.connect(admin).registerStaff(otherDoctor.address, 2);

            const mongoId = '507f1f77bcf86cd799439012';
            const recordHash = ethers.keccak256(ethers.toUtf8Bytes('test-data'));

            await expect(
                medicalLedger.connect(otherDoctor).createRecord(mongoId, patientAddress, recordHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'NoAccess');
        });
    });

    // Nhóm kiểm thử hàm ghi nhận kết quả xét nghiệm từ phòng Lab.
    // Chỉ kỹ thuật viên xét nghiệm (LAB_TECH) mới được thực hiện.
    // Kết quả được Hash-Chain với recordHash để tạo liên kết không thể giả mạo.
    describe('appendTestResult', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash;

        // Tạo sẵn một hồ sơ ở trạng thái CREATED trước mỗi test trong nhóm này
        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
        });

        it('Should allow lab tech to append test result', async function () {
            // Sau khi ghi kết quả, trạng thái hồ sơ phải chuyển sang HAS_RESULT (= 2).
            await expect(medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 2, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // HAS_RESULT = 2

            const record = await medicalLedger.records(mongoId);
            expect(record.status).to.equal(2); // HAS_RESULT

            // Xác minh cơ chế Hash-Chaining:
            // testResultHash = keccak256(recordHash + resultHash)
            // Công thức này ràng buộc kết quả xét nghiệm với đúng hồ sơ gốc.
            // Nếu bất kỳ bên nào thay đổi recordHash hoặc resultHash, hash tổng hợp sẽ không khớp.
            const expectedTestResultHash = ethers.keccak256(
                ethers.solidityPacked(['bytes32', 'bytes32'], [recordHash, resultHash])
            );
            expect(record.testResultHash).to.equal(expectedTestResultHash);
        });

        it('Should revert if non-lab-tech tries to append result', async function () {
            // Bác sĩ không được phép ghi kết quả xét nghiệm, dù đang quản lý hồ sơ đó.
            // Phân tách vai trò này đảm bảo không ai có thể tự tạo và tự phê duyệt kết quả.
            await expect(
                medicalLedger.connect(doctor).appendTestResult(mongoId, resultHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if record status is not CREATED or WAITING_RESULT', async function () {
            // Không được phép ghi kết quả xét nghiệm hai lần cho cùng một hồ sơ.
            // Sau khi đã chuyển sang HAS_RESULT, hồ sơ chỉ chờ bác sĩ chẩn đoán,
            // không thể quay lại bước xét nghiệm.
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
            await expect(
                medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'InvalidState');
        });
    });

    // Nhóm kiểm thử hàm đóng hồ sơ sau khi bác sĩ đã chẩn đoán.
    // Chỉ bác sĩ đã tạo hồ sơ ban đầu mới được đóng hồ sơ đó.
    // Hồ sơ bắt buộc phải có kết quả xét nghiệm trước khi được đóng.
    describe('closeRecord', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash, diagnosisHash;

        // Chuẩn bị hồ sơ đã qua bước xét nghiệm (HAS_RESULT) trước mỗi test
        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            diagnosisHash = ethers.keccak256(ethers.toUtf8Bytes('diagnosis-data'));

            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
        });

        it('Should allow creator doctor to close record', async function () {
            // Sau khi đóng, trạng thái hồ sơ phải chuyển sang COMPLETE (= 4).
            // Đây là trạng thái cuối cùng, không thể thay đổi thêm trên Blockchain.
            await expect(medicalLedger.connect(doctor).closeRecord(mongoId, diagnosisHash))
                .to.emit(medicalLedger, 'RecordUpdated')
                .withArgs(mongoId, 4, await ethers.provider.getBlock('latest').then(b => b.timestamp)); // COMPLETE = 4

            const record = await medicalLedger.records(mongoId);
            expect(record.status).to.equal(4); // COMPLETE
        });

        it('Should revert if non-creator doctor tries to close', async function () {
            // Bác sĩ khác, dù có quyền truy cập hợp lệ từ bệnh nhân,
            // vẫn không được đóng hồ sơ mà họ không phải người tạo.
            // Ràng buộc này đảm bảo trách nhiệm giải trình: ai tạo hồ sơ thì chịu trách nhiệm kết thúc.
            const [, , , , otherDoctor] = await ethers.getSigners();
            await identityManager.connect(admin).registerStaff(otherDoctor.address, 2);
            await accessControl.connect(patient).grantAccess(otherDoctor.address, 24);

            await expect(
                medicalLedger.connect(otherDoctor).closeRecord(mongoId, diagnosisHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'Unauthorized');
        });

        it('Should revert if trying to close without test result', async function () {
            // Hồ sơ ở trạng thái CREATED (chưa có kết quả xét nghiệm) không được đóng.
            // Ngăn chặn bác sĩ bỏ qua bước xét nghiệm và chẩn đoán trực tiếp,
            // đảm bảo vòng đời hồ sơ phải được thực hiện đúng thứ tự.
            const mongoId2 = '507f1f77bcf86cd799439012';
            await medicalLedger.connect(doctor).createRecord(mongoId2, patientAddress, recordHash);

            await expect(
                medicalLedger.connect(doctor).closeRecord(mongoId2, diagnosisHash)
            ).to.be.revertedWithCustomError(medicalLedger, 'InvalidState');
        });
    });

    // Nhóm kiểm thử hàm xác minh tính toàn vẹn dữ liệu theo 3 tầng Hash-Chaining.
    // Đây là hàm cốt lõi để phát hiện giả mạo dữ liệu trong MongoDB:
    //   hashType = 0: kiểm tra recordHash (dữ liệu ban đầu khi tạo hồ sơ)
    //   hashType = 1: kiểm tra testResultHash (kết quả xét nghiệm, đã chain với recordHash)
    //   hashType = 2: kiểm tra diagnosisHash (chẩn đoán cuối cùng, đã chain với testResultHash)
    describe('verifyIntegrity', function () {
        const mongoId = '507f1f77bcf86cd799439011';
        let recordHash, resultHash, diagnosisHash;

        // Chuẩn bị một hồ sơ hoàn chỉnh (COMPLETE) để kiểm thử toàn bộ 3 tầng hash
        beforeEach(async function () {
            recordHash = ethers.keccak256(ethers.toUtf8Bytes('record-data'));
            resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
            diagnosisHash = ethers.keccak256(ethers.toUtf8Bytes('diagnosis-data'));

            await medicalLedger.connect(doctor).createRecord(mongoId, patientAddress, recordHash);
            await medicalLedger.connect(labTech).appendTestResult(mongoId, resultHash);
            await medicalLedger.connect(doctor).closeRecord(mongoId, diagnosisHash);
        });

        it('Should verify record hash correctly', async function () {
            // Hash đúng phải trả về true, hash bị giả mạo phải trả về false.
            // Đây là bằng chứng rằng dữ liệu ban đầu trong MongoDB chưa bị chỉnh sửa.
            expect(await medicalLedger.verifyIntegrity(mongoId, recordHash, 0)).to.equal(true);
            expect(await medicalLedger.verifyIntegrity(mongoId, ethers.keccak256(ethers.toUtf8Bytes('tampered')), 0)).to.equal(false);
        });

        it('Should verify test result hash correctly', async function () {
            // resultHash gốc phải vượt qua xác minh tầng 2.
            // Contract sẽ tự tính lại keccak256(recordHash + resultHash) và so sánh
            // với testResultHash đang lưu trên chain.
            expect(await medicalLedger.verifyIntegrity(mongoId, resultHash, 1)).to.equal(true);
        });

        it('Should verify diagnosis hash correctly', async function () {
            // diagnosisHash gốc phải vượt qua xác minh tầng 3.
            // Tương tự tầng 2, contract tính lại hash tổng hợp từ testResultHash và diagnosisHash.
            expect(await medicalLedger.verifyIntegrity(mongoId, diagnosisHash, 2)).to.equal(true);
        });

        it('Should return false for invalid hashType', async function () {
            // hashType không hợp lệ (ngoài 0, 1, 2) phải trả về false thay vì revert,
            // giúp backend xử lý lỗi mềm mà không làm sập luồng kiểm tra toàn vẹn.
            expect(await medicalLedger.verifyIntegrity(mongoId, recordHash, 99)).to.equal(false);
        });
    });
});