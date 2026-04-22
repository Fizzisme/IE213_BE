import { StatusCodes } from 'http-status-codes';
import { ehrWorkflowService } from '~/services/ehrWorkflow.service';

/**
 * @swagger
 * components:
 *   schemas:
 *     PostLabResultRequest:
 *       type: object
 *       required:
 *         - rawData
 *       properties:
 *         rawData:
 *           type: object
 *           description: Dữ liệu kết quả xét nghiệm thô
 *           example:
 *             glucose: 140
 *             hba1c: 7.2
 *             cholesterol: 220
 *         note:
 *           type: string
 *           description: Ghi chú của lab tech
 *           example: "Kết quả glucose cao hơn bình thường"
 *
 *     ClinicalInterpretationRequest:
 *       type: object
 *       required:
 *         - interpretation
 *       properties:
 *         interpretation:
 *           type: string
 *           description: Diễn giải lâm sàng của bác sĩ
 *           example: "Bệnh nhân có dấu hiệu tiểu đường type 2"
 *         recommendation:
 *           type: string
 *           description: Khuyến nghị điều trị
 *           example: "Cần theo dõi đường huyết và điều chỉnh chế độ ăn"
 */

// Step 4: Patient xác nhận đồng ý
const consentToOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareConsentToOrder(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmConsentToOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmConsentToOrder(req.user, req.params.id, req.body.txHash);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 5: Lab Tech tiếp nhận order
const receiveOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareReceiveOrder(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmReceiveOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmReceiveOrder(req.user, req.params.id, req.body.txHash);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 6: Lab Tech post kết quả
const postLabResult = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.preparePostLabResult(req.user, req.params.id, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmPostLabResult = async (req, res, next) => {
    try {
        const payload = {
            ...req.body,
            txHash: req.body.txHash,
        };
        const result = await ehrWorkflowService.confirmPostLabResult(req.user, req.params.id, payload);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 7: Bác sĩ thêm diễn giải lâm sàng
const addClinicalInterpretation = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareClinicalInterpretation(req.user, req.params.id, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmClinicalInterpretation = async (req, res, next) => {
    try {
        const payload = {
            ...req.body,
            txHash: req.body.txHash,
        };
        const result = await ehrWorkflowService.confirmClinicalInterpretation(req.user, req.params.id, payload);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 8: Bác sĩ chốt hồ sơ
const completeRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareCompleteRecord(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmCompleteRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmCompleteRecord(req.user, req.params.id, req.body.txHash);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const ehrWorkflowController = {
    consentToOrder,
    confirmConsentToOrder,
    receiveOrder,
    confirmReceiveOrder,
    postLabResult,
    confirmPostLabResult,
    addClinicalInterpretation,
    confirmClinicalInterpretation,
    completeRecord,
    confirmCompleteRecord,
};
