import { medicalRecordModel } from '~/models/medicalRecord.model';
import { testResultModel } from '~/models/testResult.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { patientModel } from '~/models/patient.model';
import { auditLogModel } from '~/models/auditLog.model';

// Service tạo hồ sơ bệnh án
const createNew = async (patientId, data, currentUser) => {
    // Kiểm tra xem có bệnh nhân trong hệ thống không
    const patient = await patientModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');
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
    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'CREATE_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecord._id,
        details: { note: `Doctor created new medical record` },
    });

    return 'Tạo hồ sơ bệnh án thành công';
};
// Service chẩn đoán hồ sơ bệnh án
const diagnosis = async (medicalRecordId, data, currentUser) => {
    // Kiểm tra xem đã có hồ sơ bệnh án để chuẩn đoán
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh án');
    if (medicalRecord.status === 'COMPELTE' || medicalRecord.status === 'DIAGNOSED')
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

    // Tạo audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'DIAGNOSIS_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecordId,
        details: { note: `Doctor diagnosis medical record id:${medicalRecordId}` },
    });

    return 'Chẩn đoán hồ sơ bệnh án thành công';
};
// Service lấy hồ sơ bệnh án theo filter
const getAll = async (statusArray) => {
    // Loại bỏ các document đã bị xóa mềm
    const query = {
        _destroy: false,
    };
    // Nếu có statusArray thì thêm vào query
    if (statusArray && statusArray.length > 0) {
        query.status = { $in: statusArray };
    }

    return await medicalRecordModel.MedicalRecordModel.find(query).sort({ createdAt: -1 });
};

const getDetail = async (medicalRecordId) => {
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Lấy hồ sơ thất bại');
    return medicalRecord;
};

export const medicalRecordService = {
    createNew,
    diagnosis,
    getAll,
    getDetail,
};
