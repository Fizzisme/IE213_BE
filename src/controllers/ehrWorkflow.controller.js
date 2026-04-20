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
        const result = await ehrWorkflowService.consentToOrder(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// ============================================================================
// METAMASK FLOW: Thêm 2 endpoint mới cho consent
// ============================================================================

// Step 4a: PREPARE CONSENT TX (GET /lab-orders/:id/prepare-consent)
// Frontend gọi để nhận unsigned transaction chuẩn bị ký với MetaMask
const prepareConsentToOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareConsentToOrderTx(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 4b: CONFIRM CONSENT TX (PATCH /lab-orders/:id/consent/confirm)
// Frontend gọi sau khi ký với MetaMask, gửi txHash lên để backend verify & update MongoDB
const confirmConsentToOrder = async (req, res, next) => {
    try {
        const { txHash } = req.body;
        const result = await ehrWorkflowService.confirmConsentToOrder(req.user, req.params.id, txHash);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 5: Lab Tech tiếp nhận order
const receiveOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.receiveOrder(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 6: Lab Tech post kết quả
const postLabResult = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.postLabResult(req.user, req.params.id, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 7: Bác sĩ thêm diễn giải lâm sàng
const addClinicalInterpretation = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.addClinicalInterpretation(req.user, req.params.id, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// Step 8: Bác sĩ chốt hồ sơ
const completeRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.completeRecord(req.user, req.params.id);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// ==============================================================================
// LUỒNG METAMASK: XỬ LÝ BÁC SĨ
// ==============================================================================

const prepareAddRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareAddRecordTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmAddRecord = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmAddRecord(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const prepareInterpretation = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareInterpretationTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmInterpretation = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmInterpretation(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const prepareComplete = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareCompleteTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmComplete = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmComplete(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

// ==============================================================================
// LUỒNG METAMASK: XỬ LÝ LAB TECH
// ==============================================================================

const prepareReceiveOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.prepareReceiveOrderTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmReceiveOrder = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmReceiveOrder(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const preparePostResult = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.preparePostResultTransaction(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const confirmPostResult = async (req, res, next) => {
    try {
        const result = await ehrWorkflowService.confirmPostResult(req.user, req.body);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const ehrWorkflowController = {
    consentToOrder,
    prepareConsentToOrder,
    confirmConsentToOrder,
    receiveOrder,
    postLabResult,
    addClinicalInterpretation,
    completeRecord,
    prepareAddRecord,
    confirmAddRecord,
    prepareInterpretation,
    confirmInterpretation,
    prepareComplete,
    confirmComplete,
    prepareReceiveOrder,
    confirmReceiveOrder,
    preparePostResult,
    confirmPostResult,
};
