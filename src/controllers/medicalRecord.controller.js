import { StatusCodes } from 'http-status-codes';
import { medicalRecordService } from '~/services/medicalRecord.service';

// Controller tạo hồ sơ bệnh án (chỉ gồm thông tin cá nhân của bệnh nhân, loại xét nghiệm và notes của bác sĩ)
const createNew = async (req, res, next) => {
    try {
        const result = await medicalRecordService.createNew(req.params.patientId, req.body, req.user);
        res.status(StatusCodes.CREATED).json(result);
    } catch (e) {
        next(e);
    }
};
// Controller chẩn đoán hồ sơ bệnh án sau khi nhận được kết quả xét nghiệm
const diagnosis = async (req, res, next) => {
    try {
        const result = await medicalRecordService.diagnosis(req.params.medicalRecordId, req.body, req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Controller lấy chi tiết 1 hồ sơ bệnh án
const getDetail = async (req, res, next) => {
    try {
        const result = await medicalRecordService.getDetail(req.params.medicalRecordId, req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Controller lấy toàn bộ hồ sơ bệnh án theo filter
const getAll = async (req, res, next) => {
    try {
        const { status, sort, q } = req.query;

        let statusArray = [];
        if (status) statusArray = status.split(',');

        const sortOrder = sort === 'asc' ? 1 : -1;

        const result = await medicalRecordService.getAll(statusArray, sortOrder, q);
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

const verifyIntegrity = async (req, res, next) => {
    try {
        const result = await medicalRecordService.verifyIntegrity(req.params.medicalRecordId);
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

const verifyTx = async (req, res, next) => {
    try {
        // Controller nhận txHash từ frontend sau khi MetaMask ký, rồi chuyển xuống service để verify createRecord/closeRecord.
        const { txHash } = req.body;
        const result = await medicalRecordService.verifyTx(req.params.medicalRecordId, txHash, req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

export const medicalRecordController = {
    createNew,
    diagnosis,
    getDetail,
    getAll,
    verifyIntegrity,
    verifyTx,
};
