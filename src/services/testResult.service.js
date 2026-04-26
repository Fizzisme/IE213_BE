import { medicalRecordModel } from '~/models/medicalRecord.model';
import { labTechModel } from '~/models/labTech.model';
import { testResultModel } from '~/models/testResult.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { auditLogModel } from '~/models/auditLog.model';
import { AI_SERVICE_URL } from '~/utils/constants';
import { patientModel } from '~/models/patient.model';
import { generateDataHash } from '~/utils/algorithms';
import { medicalLedgerContract } from '~/blockchains/contract';
import { blockchainProvider } from '~/blockchains/provider';

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
    await medicalRecordModel.update(medicalRecordId, { status: 'HAS_RESULT' });

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
    };
};

const verifyTx = async (testResultId, txHash) => {
    const testResult = await testResultModel.findOneById(testResultId);
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy kết quả');

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
