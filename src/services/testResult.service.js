import { medicalRecordModel } from '~/models/medicalRecord.model';
import { labTechModel } from '~/models/labTech.model';
import { testResultModel } from '~/models/testResult.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { auditLogModel } from '~/models/auditLog.model';
import { AI_SERVICE_URL } from '~/utils/constants';
import { patientModel } from '~/models/patient.model';
import { generateDataHash } from '~/utils/algorithms';
import { blockchainAbis, medicalLedgerContract } from '~/blockchains/contract';
import { blockchainProvider } from '~/blockchains/provider';
import { userModel } from '~/models/user.model';
import { validateContractTransaction } from '~/utils/blockchainVerification';

const createNew = async (medicalRecordId, body, currentUser) => {
    const { testType, rawData } = body;
    // Kiểm tra medical record tồn tại
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh án');
    if (medicalRecord.status !== 'CREATED')
        throw new ApiError(StatusCodes.BAD_REQUEST, 'hồ sơ bệnh án với id:' + medicalRecordId + ' đã có kết quả xét nghiệm');

    // Khai báo biến testResult
    let testResult;
    // Nếu là xét nghiệm tiểu đường thì dùng dịch vụ AI
    if (testType === 'DIABETES_TEST') {
        const patient = await patientModel.findById(medicalRecord.patientId);

        const year = new Date().getUTCFullYear();

        const age = year - patient.birthYear;

        // AI_Service
        const res = await fetch(AI_SERVICE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Pregnancies: rawData.pregnancies,
                Glucose: rawData.glucose,
                BloodPressure: rawData.bloodPressure,
                SkinThickness: rawData.skinThickness,
                Insulin: rawData.insulin,
                BMI: rawData.bmi,
                DiabetesPedigreeFunction: rawData.diabetesPedigreeFunction,
                Age: age,
            }),
        });

        const d = await res.json();

        // Tạo test_result
        testResult = await testResultModel.createNew({
            patientId: medicalRecord.patientId,
            medicalRecordId,
            createdBy: currentUser._id,
            testType,
            rawData,
            aiAnalysis: {
                diabetes: d.diabetes === 1,
                probability: Math.round(d.probability * 100),
                risk: d.risk,
                aiNote: d.note,
            },
        });
    } else {
        // Tạo test_result
        testResult = await testResultModel.createNew({
            patientId: medicalRecord.patientId,
            medicalRecordId,
            createdBy: currentUser._id,
            testType,
            rawData,
        });
    }

    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Tạo kết quả xét nghiệm thất bại');

    // --- BLOCKCHAIN HASH GENERATION ---
    const resultHash = generateDataHash({
        testType: testResult.testType,
        rawData: testResult.rawData,
        aiAnalysis: testResult.aiAnalysis,
    });

    // Cập nhật trang thái hồ sơ bệnh án
    await medicalRecordModel.update(medicalRecordId, { status: 'WAITING_RESULT' });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'CREATE_TEST_RESULT',
        entityType: 'TEST_RESULT',
        entityId: testResult._id,
        details: { note: 'Lab tech create test result, waiting for blockchain sync' },
    });
    return {
        message: 'Kết quả đã được lưu, vui lòng xác nhận giao dịch trên MetaMask',
        testResultId: testResult._id,
        resultHash,
        blockchain: {
            contractAddress: medicalLedgerContract.target,
            method: 'appendTestResult',
            args: [medicalRecordId.toString(), resultHash],
        },
    };
};

const verifyTx = async (testResultId, txHash, currentUser) => {
    // 1. Lấy test result gốc để biết giao dịch này đang xác minh dữ liệu xét nghiệm nào.
    const testResult = await testResultModel.findOneById(testResultId);
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy kết quả');

    // 2. Lấy medical record cha vì contract appendTestResult dùng medicalRecordId làm tham số đầu vào.
    const medicalRecord = await medicalRecordModel.findOneById(testResult.medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ bệnh án');

    // 3. Suy ra ví blockchain chính thức của lab tech hiện tại để check signer tx.
    const labUser = await userModel.findById(currentUser._id);
    const labWallet = labUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!labWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Kỹ thuật viên chưa liên kết ví Blockchain');
    }

    // 4. Backend tự băm lại dữ liệu đang lưu trong DB để chắc tx đang append đúng nội dung test result này.
    const resultHash = generateDataHash({
        testType: testResult.testType,
        rawData: testResult.rawData,
        aiAnalysis: testResult.aiAnalysis,
    });

    // 5. Tx phải gọi đúng MedicalLedger.appendTestResult(medicalRecordId, resultHash).
    const tx = await blockchainProvider.getTransaction(txHash);
    validateContractTransaction({
        tx,
        abi: blockchainAbis.MedicalLedger,
        expectedContract: medicalLedgerContract.target,
        expectedMethod: 'appendTestResult',
        expectedArgs: [medicalRecord._id.toString(), resultHash],
    });

    // 6. Dù calldata đúng, signer vẫn bắt buộc phải là ví lab tech hiện tại.
    if (tx.from.toLowerCase() !== labWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch blockchain không được ký bởi ví kỹ thuật viên hiện tại');
    }

    // Đợi Receipt từ Blockchain
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        // 1. Cập nhật trạng thái đồng bộ trong bảng TestResult
        await testResultModel.TestResultModel.updateOne(
            { _id: testResultId },
            {
                $set: {
                    blockchainMetadata: {
                        isSynced: true,
                        txHash: txHash,
                        syncAt: new Date(),
                    },
                },
            },
        );

        // 2. TẬP TRUNG HÓA DỮ LIỆU: Cập nhật labTxHash vào bảng MedicalRecord tương ứng
        // Điều này giúp việc Audit Trail của 1 bệnh án được quy về một mối
        await medicalRecordModel.update(testResult.medicalRecordId, {
            'blockchainMetadata.labTxHash': txHash,
            status: 'HAS_RESULT',
        });

        return 'Đồng bộ Blockchain thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch trên Blockchain thất bại');
    }
};

const getDetail = async (testResultId) => {
    const testResult = await testResultModel.findOneById(testResultId);
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy kết quả xét nghiệm');
    return testResult;
};

const getAll = async () => {
    const testResults = await testResultModel.TestResultModel.find({ _destroy: false });
    if (!testResults) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy kết quả xét nghiệm');
    return testResults;
};

export const testResultService = {
    createNew,
    getDetail,
    getAll,
    verifyTx,
};
