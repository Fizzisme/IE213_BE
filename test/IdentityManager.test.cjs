const { expect } = require('chai');
const { ethers } = require('hardhat');

// Bộ kiểm thử cho Smart Contract IdentityManager.
// Contract này chịu trách nhiệm quản lý danh tính và phân quyền vai trò
// cho toàn bộ các tài khoản trong hệ thống (Admin, Doctor, LabTech, Patient).
describe('IdentityManager', function () {
    let identityManager;
    let admin, doctor, labTech, patient;

    // Chạy lại trước mỗi test case để đảm bảo môi trường sạch hoàn toàn.
    // Mỗi test case nhận một instance contract mới, tránh ảnh hưởng chéo
    // giữa các test (side effects).
    beforeEach(async function () {
        [admin, doctor, labTech, patient] = await ethers.getSigners();

        const IdentityManager = await ethers.getContractFactory('IdentityManager');
        identityManager = await IdentityManager.deploy();
        await identityManager.waitForDeployment();
    });

    // Nhóm kiểm thử trạng thái khởi tạo ngay sau khi deploy.
    // Đảm bảo constructor chạy đúng logic mà không cần bất kỳ lời gọi nào khác.
    describe('Deployment', function () {
        it('Should set the deployer as admin', async function () {
            // Địa chỉ deploy phải được lưu làm admin của contract
            expect(await identityManager.admin()).to.equal(admin.address);
        });

        it('Should auto-register admin with ADMIN role', async function () {
            // Constructor phải tự đăng ký deployer với vai trò ADMIN (= 4) và trạng thái active.
            // Không cần gọi thêm bất kỳ hàm nào sau khi deploy.
            const account = await identityManager.accounts(admin.address);
            expect(account.role).to.equal(4); // Role.ADMIN = 4
            expect(account.isActive).to.equal(true);
        });
    });

    // Nhóm kiểm thử hàm đăng ký nhân viên y tế (Doctor, LabTech).
    // Chỉ admin mới được phép thực hiện, và không cho phép đăng ký trùng
    // hoặc gán vai trò không hợp lệ.
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
            // Tài khoản không phải admin không được phép đăng ký nhân viên.
            // Contract phải ném lỗi NotAdmin thay vì thực thi thành công.
            await expect(
                identityManager.connect(doctor).registerStaff(patient.address, 2)
            ).to.be.revertedWithCustomError(identityManager, 'NotAdmin');
        });

        it('Should revert if registering existing account', async function () {
            // Đăng ký cùng một địa chỉ hai lần phải bị từ chối.
            // Tránh ghi đè vai trò của tài khoản đã tồn tại trong hệ thống.
            await identityManager.connect(admin).registerStaff(doctor.address, 2);
            await expect(
                identityManager.connect(admin).registerStaff(doctor.address, 2)
            ).to.be.revertedWithCustomError(identityManager, 'AccountExists');
        });

        it('Should revert if invalid staff role', async function () {
            // Vai trò PATIENT (= 1) không được phép gán qua hàm registerStaff.
            // Bệnh nhân phải đăng ký qua luồng riêng (registerPatientGasless)
            // để đảm bảo xác thực chữ ký.
            await expect(
                identityManager.connect(admin).registerStaff(doctor.address, 1) // PATIENT
            ).to.be.revertedWith('Invalid staff role');
        });
    });

    // Nhóm kiểm thử hàm đăng ký bệnh nhân theo mô hình Gasless Transaction.
    // Bệnh nhân ký thông điệp cố định off-chain, admin nộp giao dịch lên chain thay.
    // Mục đích: bệnh nhân không cần nắm giữ ETH để trả gas khi đăng ký lần đầu.
    describe('registerPatientGasless', function () {
        it('Should register patient with valid signature', async function () {
            // Bệnh nhân ký thông điệp 'REGISTER_ZUNI_PATIENT' bằng ví của mình.
            // Admin gửi địa chỉ bệnh nhân kèm chữ ký lên contract để xác thực.
            // Contract tự phục hồi địa chỉ từ chữ ký và so sánh với tham số đầu vào.
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
            // Chữ ký giả (toàn byte 0) không thể phục hồi ra đúng địa chỉ bệnh nhân.
            // Contract phải phát hiện và từ chối, tránh đăng ký tài khoản trái phép.
            const fakeSignature = '0x' + '00'.repeat(65);
            await expect(
                identityManager.connect(admin).registerPatientGasless(patient.address, fakeSignature)
            ).to.be.revertedWithCustomError(identityManager, 'InvalidSignature');
        });

        it('Should revert if patient already exists', async function () {
            // Dù chữ ký hợp lệ, không được phép đăng ký lại tài khoản đã tồn tại.
            // Ngăn chặn ghi đè thông tin bệnh nhân bằng cách phát lại chữ ký cũ (replay attack).
            const message = 'REGISTER_ZUNI_PATIENT';
            const signature = await patient.signMessage(message);
            await identityManager.connect(admin).registerPatientGasless(patient.address, signature);

            await expect(
                identityManager.connect(admin).registerPatientGasless(patient.address, signature)
            ).to.be.revertedWithCustomError(identityManager, 'AccountExists');
        });
    });

    // Nhóm kiểm thử hàm truy vấn vai trò của một địa chỉ.
    // Dùng bởi các contract khác (AccessControl, MedicalLedger) để kiểm tra quyền
    // trước khi cho phép thực thi các hành động nhạy cảm.
    describe('hasRole', function () {
        it('Should return true for admin with ADMIN role', async function () {
            // Admin được tự động đăng ký khi deploy, hasRole phải trả về true ngay lập tức.
            expect(await identityManager.hasRole(admin.address, 4)).to.equal(true);
        });

        it('Should return false for unregistered user', async function () {
            // Địa chỉ chưa được đăng ký không có bất kỳ vai trò nào trong hệ thống.
            expect(await identityManager.hasRole(patient.address, 1)).to.equal(false);
        });
    });

    // Nhóm kiểm thử hàm chuyển giao quyền admin sang địa chỉ khác.
    // Đây là thao tác đặc quyền cao nhất trong contract, chỉ admin hiện tại mới thực hiện được.
    describe('transferAdmin', function () {
        it('Should allow admin to transfer admin role', async function () {
            // Sau khi chuyển giao, biến admin trên contract phải cập nhật sang địa chỉ mới.
            await identityManager.connect(admin).transferAdmin(doctor.address);
            expect(await identityManager.admin()).to.equal(doctor.address);
        });

        it('Should revert if non-admin tries to transfer', async function () {
            // Tài khoản không phải admin tuyệt đối không được phép chuyển giao quyền admin.
            // Nếu bỏ sót kiểm tra này, bất kỳ ai cũng có thể chiếm quyền kiểm soát contract.
            await expect(
                identityManager.connect(doctor).transferAdmin(patient.address)
            ).to.be.revertedWithCustomError(identityManager, 'NotAdmin');
        });
    });
});