import { medicalRecordModel } from '~/models/medicalRecord.model';
import { labTechModel } from '~/models/labTech.model';
import { testResultModel } from '~/models/testResult.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';
import { auditLogModel } from '~/models/auditLog.model';

const createNew = async (medicalRecordId, body, currentUser) => {
    const { testType, rawData } = body;
    // Kiểm tra medical record tồn tại
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, `Không có hồ sơ bệnh án`);
    if (medicalRecord.status !== 'CREATED')
        throw new ApiError(StatusCodes.BAD_REQUEST, `hồ sơ bệnh án với id:${medicalRecordId} đã có kết quả xét nghiệm`);

    // Tạo test_result
    const testResult = await testResultModel.createNew({
        patientId: medicalRecord.patientId,
        medicalRecordId,
        createdBy: currentUser._id,
        testType,
        rawData,
    });
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Tạo kết quả xét nghiệm thất bại');

    // Cập nhật trang thái hồ sơ bệnh án
    await medicalRecordModel.update(medicalRecordId, { status: 'HAS_RESULT' });

    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'CREATE_TEST_RESULT',
        entityType: 'TEST_RESULT',
        entityId: testResult._id,
        details: { note: `Lab tech create test result id:${testResult._id}` },
    });
    return 'Tạo kết quả xét nghiệm thành công';
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
};
