import { medicalRecordModel } from '~/models/medicalRecord.model';
import { testResultModel } from '~/models/testResult.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { patientModel } from '~/models/patient.model';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
import { generateDataHash } from '~/utils/algorithms';
import { medicalLedgerContract, dynamicAccessControlContract } from '~/blockchains/contract';
import { blockchainProvider } from '~/blockchains/provider';

// Service tạo hồ sơ bệnh án
const createNew = async (patientId, data, currentUser) => {
    // Kiểm tra xem có bệnh nhân trong hệ thống không
    const patient = await patientModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

    // Lấy thông tin User để lấy Wallet Address của bệnh nhân
    const userPatient = await userModel.findById(patient.userId);
    const walletProvider = userPatient.authProviders.find((p) => p.type === 'WALLET');
    const patientWallet = walletProvider?.walletAddress;

    if (!patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa liên kết ví Blockchain');
    }

    const existingRecord = await medicalRecordModel.findOneByPatientId(patientId, [
        'CREATED',
        'WAITING_RESULT',
        'HAS_RESULT',
    ]);

    if (existingRecord.length) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Đã tồn tại hồ sơ chưa hoàn thành');
    }
    // Bản ghi mới gồm patientId, createdBy, type va note
    const newRecord = {
        patientId,
        createdBy: currentUser._id,
        type: data.type,
        note: data.note,
        createdAt: new Date(),
    };
    const medicalRecord = await medicalRecordModel.createNew(newRecord);
    // Lỗi nếu tạo hồ sơ thất bại
    if (!medicalRecord) throw new ApiError(StatusCodes.BAD_REQUEST, 'Tạo hồ sơ bệnh án thất bại');

    // --- BLOCKCHAIN HASH GENERATION ---
    const recordHash = generateDataHash({
        type: medicalRecord.type,
        note: medicalRecord.note,
        patientId: medicalRecord.patientId.toString(),
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'CREATE_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecord._id,
        details: { note: `Doctor created new medical record, waiting for blockchain sync` },
    });

    return {
        message: 'Hồ sơ đã được lưu, vui lòng xác nhận giao dịch trên MetaMask',
        medicalRecordId: medicalRecord._id,
        patientWallet,
        recordHash,
    };
};
// Service chẩn đoán hồ sơ bệnh án
const diagnosis = async (medicalRecordId, data, currentUser) => {
    // Kiểm tra xem đã có hồ sơ bệnh án để chuẩn đoán
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh án');
    if (medicalRecord.status === 'COMPLETE' || medicalRecord.status === 'DIAGNOSED')
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Hồ sơ đã được hoàn thành');

    // Kiểm tra xem có Kết quả xét nghiệm chưa
    const testResult = await testResultModel.findOneById(data.testResultId);
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có kết quả xét nghiệm');

    const updateRecord = {
        testResultId: data.testResultId,
        diagnosis: data.diagnosis,
        note: data.note,
        status: 'DIAGNOSED',
    };

    // Lỗi hệ thống khi cập nhật
    const medicalRecordDiagnosed = await medicalRecordModel.update(medicalRecordId, updateRecord);
    if (!medicalRecordDiagnosed) throw new ApiError(StatusCodes.BAD_REQUEST, 'Chẩn đoán thất bại');

    // --- BLOCKCHAIN HASH GENERATION ---
    const diagnosisHash = generateDataHash({
        diagnosis: data.diagnosis,
        note: data.note,
        testResultId: data.testResultId.toString(),
    });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'DIAGNOSIS_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecordId,
        details: { note: `Doctor diagnosis medical record, waiting for blockchain sync` },
    });

    return {
        message: 'Chẩn đoán đã được lưu, vui lòng xác nhận giao dịch trên MetaMask',
        medicalRecordId,
        diagnosisHash,
    };
};

// Hàm kiểm tra tính toàn vẹn dữ liệu giữa MongoDB và Blockchain
const verifyIntegrity = async (medicalRecordId) => {
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ');

    const recordHash = generateDataHash({
        type: medicalRecord.type,
        note: medicalRecord.note,
        patientId: medicalRecord.patientId.toString(),
    });

    // Gọi hàm verifyIntegrity trên Smart Contract (hashType = 0 cho recordHash)
    const isValid = await medicalLedgerContract.verifyIntegrity(
        medicalRecordId.toString(),
        recordHash,
        0,
    );

    return {
        medicalRecordId,
        isValid,
        mongodbHash: recordHash,
        status: medicalRecord.status,
    };
};

// Xác minh giao dịch sau khi Frontend đã ký qua MetaMask
const verifyTx = async (medicalRecordId, txHash) => {
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ');

    // Đợi Receipt từ Blockchain
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        // Cập nhật trạng thái đồng bộ
        await medicalRecordModel.update(medicalRecordId, {
            blockchainMetadata: {
                isSynced: true,
                txHash: txHash,
                syncAt: new Date(),
            },
        });

        // Tạo audit log
        await auditLogModel.createLog({
            userId: medicalRecord.createdBy,
            action: 'VERIFY_BLOCKCHAIN_SYNC',
            entityType: 'MEDICAL_RECORD',
            entityId: medicalRecordId,
            details: { txHash, note: 'Blockchain sync verified successfully' },
        });

        return 'Đồng bộ Blockchain thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch trên Blockchain thất bại');
    }
};

// Service lấy hồ sơ bệnh án theo filter
const getAll = async (statusArray, sortOrder, q) => {
    // Loại bỏ các document đã bị xóa mềm
    const query = {
        _destroy: false,
    };
    // Nếu có statusArray thì thêm vào query
    if (statusArray && statusArray.length > 0) {
        query.status = { $in: statusArray };
    }

    // Lấy cả thông tin bệnh nhân trả về
    const medicalRecords = await medicalRecordModel.MedicalRecordModel.find(query)
        .populate({
            path: 'patientId',
            select: '_id fullName gender birthYear phoneNumber avatar',
        })
        .sort({ createdAt: sortOrder });

    let filteredRecords = medicalRecords;
    if (q) {
        const keyword = q.toLowerCase();

        filteredRecords = medicalRecords.filter((record) => {
            const patient = record.patientId;
            return (
                patient?.fullName?.toLowerCase().includes(keyword) ||
                patient?.phoneNumber?.toLowerCase().includes(keyword)
            );
        });
    }

    // Rename lại object thông tin bệnh nhân
    return filteredRecords.map((record) => {
        const obj = record.toObject();

        obj.patientInfo = obj.patientId;
        delete obj.patientId;

        return obj;
    });
};

const getDetail = async (medicalRecordId, currentUser) => {
    // 1. TÌM BỆNH ÁN VÀ THÔNG TIN BỆNH NHÂN
    let medicalRecord = await medicalRecordModel.MedicalRecordModel.findById(medicalRecordId).populate({
        path: 'patientId',
        select: '_id userId fullName gender birthYear phoneNumber avatar',
    });

    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Lấy hồ sơ thất bại');

    // --- BLOCKCHAIN ACCESS CHECK ---
    // Nếu ngườ i xem là Bác sĩ, phải kiểm tra quyền xem On-chain (DynamicAccessControl)
    if (currentUser.role === 'DOCTOR') {
        const doctorUser = await userModel.findById(currentUser._id);
        const doctorWallet = doctorUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

        const patientUser = await userModel.findById(medicalRecord.patientId.userId);
        const patientWallet = patientUser.authProviders.find(p => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet && patientWallet) {
            const hasAccess = await dynamicAccessControlContract.canAccess(patientWallet, doctorWallet);
            if (!hasAccess) {
                throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền truy cập hồ sơ này trên Blockchain (Truy cập đã hết hạn hoặc chưa được cấp)');
            }
        }
    }

    // Chuyển sang plain object để dễ dàng thêm/sửa thuộc tính gửi cho Frontend
    medicalRecord = medicalRecord.toObject();

    // Đồng bộ tên biến patientInfo giống hàm getAll
    if (medicalRecord.patientId) {
        medicalRecord.patientInfo = medicalRecord.patientId;
        delete medicalRecord.patientId;
    }

    // 2. TÌM KẾT QUẢ XÉT NGHIỆM (TEST RESULT) GẮN VÀO BỆNH ÁN
    try {
        let testResultData = null;

        // Kịch bản A: Nếu Bệnh án có lưu sẵn testResultId hoặc mảng relatedLabOrderIds
        if (medicalRecord.testResultId) {
            testResultData = await testResultModel.findOneById(medicalRecord.testResultId);
        } else if (medicalRecord.relatedLabOrderIds && medicalRecord.relatedLabOrderIds.length > 0) {
            testResultData = await testResultModel.findOneById(medicalRecord.relatedLabOrderIds[0]);
        }
        // Kịch bản B: Tìm ngược từ bảng TestResult (Cách an toàn nhất)
        // Dựa vào Swagger, TestResult lưu medicalRecordId bên trong nó
        else if (testResultModel.TestResultModel) {
            testResultData = await testResultModel.TestResultModel.findOne({
                medicalRecordId: medicalRecordId,
            }).sort({ createdAt: -1 });
        }

        // Nếu tìm thấy kết quả từ phòng Lab, đắp nó vào biến testResult cho Frontend đọc
        if (testResultData) {
            medicalRecord.testResult = testResultData;
        }
    } catch (error) {
        console.error('Lỗi khi đính kèm kết quả Lab vào Bệnh án:', error);
        // Không throw error ở đây để tránh làm chết trang chi tiết nếu Lab bị lỗi
    }

    return medicalRecord;
};

export const medicalRecordService = {
    createNew,
    diagnosis,
    getAll,
    getDetail,
    verifyIntegrity,
    verifyTx,
};
