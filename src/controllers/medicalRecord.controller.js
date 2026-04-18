import { StatusCodes } from 'http-status-codes';
import { medicalRecordService } from '~/services/medicalRecord.service';
import { ehrWorkflowService } from '~/services/ehrWorkflow.service';

// Controller tạo hồ sơ bệnh án (chỉ gồm thông tin cá nhân của bệnh nhân, loại xét nghiệm và notes của bác sĩ)
const createNew = async (req, res, next) => {
    try {
        const result = await medicalRecordService.createNew(req.params.patientId, req.body, req.user);
        res.status(StatusCodes.CREATED).json(result);
    } catch (e) {
        next(e);
    }
};
// 🆕 Diagnosis consolidated into createNew() - PATCH endpoint removed
// (Doctor adds diagnosis when creating medical record)

// Controller lấy chi tiết 1 hồ sơ bệnh án
const getDetail = async (req, res, next) => {
    try {
        const result = await medicalRecordService.getDetail(
            req.params.medicalRecordId,
            req.user  // ✅ NEW: Pass current user for access check
        );
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Controller lấy toàn bộ hồ sơ bệnh án theo filter
const getAll = async (req, res, next) => {
    try {
        const status = req.query.status;

        let statusArray = [];
        if (status) statusArray = status.split(',');

        const result = await medicalRecordService.getAll(
            statusArray,
            req.grantedPatients  // ✅ NEW: Filter by granted patients from middleware
        );
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

// [DIRECT COMPLETE] Hoàn thành hồ sơ bệnh án (không có xét nghiệm)
// Trường hợp: Bệnh nhân đến khám, bác sĩ chẩn đoán lâm sàng → không cần lab order
const directCompleteRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.directCompleteRecord(
            req.user,  // ← Current doctor
            req.params.medicalRecordId  // ← Medical record ID từ URL
        );
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy tất cả medical records của 1 bệnh nhân (doctor có quyền xem)
const getPatientMedicalRecords = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const status = req.query.status;

        let statusArray = [];
        if (status) statusArray = status.split(',');

        const result = await medicalRecordService.getPatientMedicalRecords(
            patientId,
            statusArray,
            req.user  // Pass current doctor for access check
        );
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

export const medicalRecordController = {
    createNew,
    getDetail,
    getAll,
    directCompleteRecord,
    getPatientMedicalRecords,
};
