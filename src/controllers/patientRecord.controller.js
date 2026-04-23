import { StatusCodes } from 'http-status-codes';
import { patientRecordService } from '~/services/patientRecord.service';

/**
 * @swagger
 * components:
 *   schemas:
 *     VerifyHashRequest:
 *       type: object
 *       required:
 *         - recordId
 *         - computedHash
 *         - hashType
 *       properties:
 *         recordId:
 *           type: string
 *           description: ID của record trên blockchain
 *           example: "1"
 *         computedHash:
 *           type: string
 *           description: Hash tính từ dữ liệu IPFS
 *           example: "0x123..."
 *         hashType:
 *           type: number
 *           description: "Loại hash: 0 = orderHash, 1 = labResultHash, 2 = interpretationHash"
 *           example: 1
 */

// Lấy danh sách tất cả record của bệnh nhân
const getMyRecords = async (req, res, next) => {
    try {
        const result = await patientRecordService.getMyRecords(req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Lấy chi tiết một record cụ thể
const getRecordDetail = async (req, res, next) => {
    try {
        const result = await patientRecordService.getRecordDetail(req.user, req.params.recordId);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Verify hash của record
const verifyRecordHash = async (req, res, next) => {
    try {
        const { recordId, computedHash, hashType } = req.body;
        const result = await patientRecordService.verifyRecordHash(req.user, recordId, computedHash, hashType);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const patientRecordController = {
    getMyRecords,
    getRecordDetail,
    verifyRecordHash,
};
