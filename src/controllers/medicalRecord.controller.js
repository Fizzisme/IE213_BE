import { StatusCodes } from 'http-status-codes';
import { medicalRecordService } from '~/services/medicalRecord.service';

/**
 * Tạo hồ sơ bệnh án mới
 * - Dữ liệu gồm: thông tin bệnh nhân, loại xét nghiệm, ghi chú ban đầu của bác sĩ
 * - Controller chỉ nhận request và chuyển xuống service xử lý
 */
const createNew = async (req, res, next) => {
    try {
        const result = await medicalRecordService.createNew(
            req.params.patientId, // id bệnh nhân
            req.body,             // dữ liệu hồ sơ
            req.user              // thông tin user hiện tại (bác sĩ)
        );

        res.status(StatusCodes.CREATED).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * Chẩn đoán hồ sơ bệnh án
 * - Thực hiện sau khi có kết quả xét nghiệm
 * - Service sẽ cập nhật kết luận, trạng thái hồ sơ
 */
const diagnosis = async (req, res, next) => {
    try {
        const result = await medicalRecordService.diagnosis(
            req.params.medicalRecordId, // id hồ sơ
            req.body,                   // dữ liệu chẩn đoán
            req.user                    // bác sĩ thực hiện
        );

        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * Lấy chi tiết một hồ sơ bệnh án
 * - Có thể kèm kiểm tra quyền truy cập trong service
 */
const getDetail = async (req, res, next) => {
    try {
        const result = await medicalRecordService.getDetail(
            req.params.medicalRecordId,
            req.user
        );

        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * Lấy danh sách tất cả hồ sơ bệnh án (có filter)
 * Query:
 * - status: trạng thái (có thể nhiều giá trị, phân tách bằng dấu phẩy)
 * - sort: asc hoặc desc
 * - q: keyword tìm kiếm
 */
const getAll = async (req, res, next) => {
    try {
        const { status, sort, q } = req.query;

        // Convert status từ string → array
        let statusArray = [];
        if (status) statusArray = status.split(',');

        // Xác định thứ tự sort
        const sortOrder = sort === 'asc' ? 1 : -1;

        const result = await medicalRecordService.getAll(
            statusArray,
            sortOrder,
            q
        );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy danh sách hồ sơ của một bệnh nhân cụ thể
 */
const getPatientMedicalRecords = async (req, res, next) => {
    try {
        const result =
            await medicalRecordService.getPatientMedicalRecords(
                req.params.patientId,
                req.user
            );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy hồ sơ bệnh án của chính user hiện tại
 * - Có thể filter theo trạng thái
 */
const getMyMedicalRecords = async (req, res, next) => {
    try {
        const { status } = req.query;

        // Convert status sang array nếu có
        const statusArray = status ? status.split(',') : [];

        const result =
            await medicalRecordService.getMyMedicalRecords(
                req.user,
                statusArray
            );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy chi tiết hồ sơ bệnh án của chính user
 * - Khác với getDetail ở chỗ có thể giới hạn quyền truy cập chặt hơn
 */
const getMyMedicalRecordDetail = async (req, res, next) => {
    try {
        const result =
            await medicalRecordService.getMyMedicalRecordDetail(
                req.params.medicalRecordId,
                req.user
            );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Verify tính toàn vẹn dữ liệu hồ sơ (integrity)
 * - So sánh dữ liệu trong DB với dữ liệu lưu trên blockchain
 */
const verifyIntegrity = async (req, res, next) => {
    try {
        const result =
            await medicalRecordService.verifyIntegrity(
                req.params.medicalRecordId
            );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Verify transaction blockchain
 * - Frontend gửi txHash sau khi user ký MetaMask
 * - Backend verify:
 *   + Transaction có tồn tại không
 *   + Có đúng contract không
 *   + Có đúng hành động (create/close record) không
 */
const verifyTx = async (req, res, next) => {
    try {
        const { txHash } = req.body;

        const result = await medicalRecordService.verifyTx(
            req.params.medicalRecordId,
            txHash,
            req.user
        );

        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Export controller
 */
export const medicalRecordController = {
    createNew,
    diagnosis,
    getDetail,
    getAll,
    getPatientMedicalRecords,
    verifyIntegrity,
    verifyTx,
    getMyMedicalRecords,
    getMyMedicalRecordDetail,
};