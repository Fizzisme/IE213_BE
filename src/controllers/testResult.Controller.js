import { testResultService } from '~/services/testResult.service';
import { StatusCodes } from 'http-status-codes';

// Controller tạo mới kết quả xét nghiệm
const createNew = async (req, res) => {
    try {
        const result = await testResultService.createNew(req.params.medicalRecordId, req.body, req.user);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Controller lấy chi tiết 1 kết quả xét nghiệm
const getDetail = async (req, res, next) => {
    try {
        const result = await testResultService.getDetail(req.params.testResultId);
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

// Controller lấy tất cả kết quả xét nghiệm
const getAll = async (req, res, next) => {
    try {
        const result = await testResultService.getAll();
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

export const testResultController = {
    createNew,
    getAll,
    getDetail,
};
