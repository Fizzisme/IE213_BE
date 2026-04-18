import { StatusCodes } from 'http-status-codes';
import { labOrderService } from '~/services/labOrder.service';

/**
 * @swagger
 * /v1/lab-orders:
 *   post:
 *     summary: Doctor gửi yêu cầu xét nghiệm (LabOrder) cho Lab Tech
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       **[SECURITY ENFORCED]** Doctor phải CHỈ RÕ (explicit) hồ sơ bệnh án khi tạo lab order.
 *       Không có auto-attach vào hồ sơ "mới nhất" - đặc biệt quan trọng cho bảo mật dữ liệu y tế.
 *       
 *       **Validation Rules:**
 *       1. medicalRecordId MUST be provided (required)
 *       2. Medical record must exist & belong to this patient
 *       3. Medical record status ≠ COMPLETE (không thể thêm exam vào đơn đã hoàn tất)
 *       4. Patient address must match patient's wallet in database
 *       
 *       **State Management:**
 *       - Lab Order starts: ORDERED (status=0)
 *       - Medical Record updates: CREATED → WAITING_RESULT 
 *       - When lab order finishes: COMPLETE → Medical Record syncs to COMPLETE
 *       - Two-way linking: Medical Record tracks all relatedLabOrderIds
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientAddress
 *               - recordType
 *               - testsRequested
 *               - medicalRecordId
 *             properties:
 *               patientAddress:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: "Địa chỉ ví bệnh nhân (phải khớp với wallet trong database)"
 *                 example: "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
 *               recordType:
 *                 type: string
 *                 enum: [GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT]
 *                 description: "Loại xét nghiệm cần thực hiện"
 *                 example: "DIABETES_TEST"
 *               testsRequested:
 *                 type: array
 *                 minItems: 1
 *                 description: "Danh sách xét nghiệm (ít nhất 1)"
 *                 items:
 *                   type: object
 *                   required: [code, name]
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "GLUCOSE"
 *                     name:
 *                       type: string
 *                       example: "Glucose (fasting)"
 *                     group:
 *                       type: string
 *                       example: "metabolic"
 *                     urgent:
 *                       type: boolean
 *                       example: false
 *                     note:
 *                       type: string
 *                       example: "NPO 8 hours"
 *               medicalRecordId:
 *                 type: string
 *                 pattern: '^[0-9a-fA-F]{24}$'
 *                 description: |
 *                   **REQUIRED & CRITICAL** 🔥
 *                   MongoDB ObjectId của hồ s� bệnh án liên kết.
 *                   - Doctor phải CHỈ RÕ hồ sơ nào để tạo lab order
 *                   - Không được auto-attach vào hồ sơ "mới nhất"
 *                   - Hồ sơ phải tồn tại, thuộc bệnh nhân này, status ≠ COMPLETE
 *                 example: "69d7d0e717b56dd8d0b93107"
 *               priority:
 *                 type: string
 *                 enum: [normal, urgent, emergency]
 *                 description: "Mức ưu tiên xử lý"
 *                 example: "urgent"
 *               clinicalNote:
 *                 type: string
 *                 description: "Ghi chú lâm sàng từ doctor"
 *                 example: "Sốt cao 39°C, nghi ngờ nhiễm trùng huyết"
 *               sampleType:
 *                 type: string
 *                 enum: [blood, urine, stool, swab, other]
 *                 description: "Loại mẫu cần lấy"
 *                 example: "blood"
 *               diagnosisCode:
 *                 type: string
 *                 description: "Mã chẩn đoán ICD-10"
 *                 example: "A41.9"
 *               attachments:
 *                 type: array
 *                 description: "File đính kèm (IPFS URIs)"
 *                 items:
 *                   type: string
 *                 example: ["ipfs://QmXxxx"]
 *             example:
 *               patientAddress: "0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB"
 *               recordType: "DIABETES_TEST"
 *               medicalRecordId: "69d7d0e717b56dd8d0b93107"
 *               testsRequested:
 *                 - code: "GLUCOSE"
 *                   name: "Glucose (fasting)"
 *                   group: "metabolic"
 *                   urgent: false
 *                   note: "NPO 8 hours"
 *                 - code: "HBA1C"
 *                   name: "Hemoglobin A1c"
 *                   group: "metabolic"
 *                   urgent: true
 *               priority: "urgent"
 *               clinicalNote: "Rule out diabetes. Patient with polydipsia & polyuria."
 *               sampleType: "blood"
 *               diagnosisCode: "E11"
 *               attachments: []
 *     responses:
 *       201:
 *         description: ✅ Tạo LabOrder thành công, linked to medical record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordId:
 *                   type: string
 *                   description: "blockchain recordId"
 *                   example: "1"
 *                 txHash:
 *                   type: string
 *                   description: "Transaction hash"
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   enum: [ORDERED]
 *                   example: "ORDERED"
 *                 labOrderId:
 *                   type: string
 *                   description: "MongoDB ObjectId của lab order vừa tạo"
 *                   example: "69d867a894664aa591ff617d"
 *                 orderHash:
 *                   type: string
 *                   description: "Keccak256 hash của metadata"
 *       400:
 *         description: |
 *           Validation Error - Các lỗi có thể gặp:
 *           - Missing required fields (patientAddress, recordType, medicalRecordId, testsRequested)
 *           - Invalid medicalRecordId format (not valid MongoDB ObjectId)
 *           - Medical record not found or doesn't belong to this patient
 *           - Medical record status = COMPLETE (không thể thêm exam vào đơn đã hoàn tất)
 *           - Patient address doesn't match database wallet
 *       401:
 *         description: "Unauthorized - Missing or invalid JWT token"
 *       403:
 *         description: "Forbidden - User is not DOCTOR role"
 *       404:
 *         description: "Patient or medical record not found"
 *       500:
 *         description: "Server error or blockchain call failed"
 */
const createLabOrder = async (req, res, next) => {
    try {
        const result = await labOrderService.createLabOrder(req.body, req.user);
        res.status(StatusCodes.CREATED).json(result);
    } catch (e) {
        next(e);
    }
};

const getLabOrderDetail = async (req, res, next) => {
    try {
        const result = await labOrderService.getLabOrderDetail(req.params.id, req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

const getLabOrders = async (req, res, next) => {
    try {
        const result = await labOrderService.getLabOrders(req.user, req.query);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * @swagger
 * /v1/lab-orders/{labOrderId}:
 *   delete:
 *     summary: ❌ Xóa lab order (chỉ được phép nếu status = ORDERED)
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       **[CLEANUP LOGIC]** Xóa lab order hoàn toàn từ hệ thống.
 *       - Chỉ có thể xóa khi status = ORDERED (chưa được patient consent)
 *       - Tự động remove lab order ID khỏi medical record's relatedLabOrderIds
 *       - Xóa tất cả audit logs liên quan
 *       - **Cảnh báo:** Không thể undo - dùng cancelLabOrder để soft-delete thay vì
 *     parameters:
 *       - in: path
 *         name: labOrderId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId của lab order cần xóa
 *         example: "69d867a894664aa591ff617d"
 *     responses:
 *       200:
 *         description: ✅ Xóa thành công + tự động clean medical record linking
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lab order deleted successfully"
 *                 deletedCount:
 *                   type: number
 *                   example: 1
 *       404:
 *         description: Lab order không tìm thấy
 *       409:
 *         description: |
 *           Conflict - Không thể xóa vì:
 *           - Status ≠ ORDERED (đã được patient consent hoặc hoàn thành)
 *           - Lab order đã ở trạng thái không cho phép xóa
 *       500:
 *         description: Lỗi server
 */
const deleteLabOrder = async (req, res, next) => {
    try {
        const { labOrderId } = req.params;
        const result = await labOrderService.deleteLabOrder(labOrderId);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

/**
 * @swagger
 * /v1/lab-orders/{labOrderId}/cancel:
 *   patch:
 *     summary: ⏸️ Hủy lab order (soft-delete - giữ record, chỉ thay status)
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       **[SOFT CANCEL]** Thay đổi status thành CANCELLED (giữ lại dữ liệu).
 *       - Không xóa dữ liệu, chỉ đánh dấu là đã hủy
 *       - Không remove khỏi medical record's relatedLabOrderIds (audit trail)
 *       - Có thể set lý do hủy (reason) để ghi chú
 *       - Không thể hủy order đã COMPLETE hoặc đã CANCELLED
 *     parameters:
 *       - in: path
 *         name: labOrderId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId của lab order cần hủy
 *         example: "69d867a894664aa591ff617d"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Lý do hủy (optional)
 *                 example: "Bệnh nhân từ chối xét nghiệm"
 *           example:
 *             reason: "Patient requested cancellation - will pursue conservative management"
 *     responses:
 *       200:
 *         description: ✅ Hủy thành công (status → CANCELLED, dữ liệu được giữ lại)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lab order cancelled successfully"
 *                 labOrderId:
 *                   type: string
 *                   example: "69d867a894664aa591ff617d"
 *                 newStatus:
 *                   type: string
 *                   enum: [CANCELLED]
 *       404:
 *         description: Lab order không tìm thấy
 *       409:
 *         description: |
 *           Conflict - Không thể hủy vì:
 *           - Status = COMPLETE (đơn đã hoàn thành)
 *           - Status = CANCELLED (đã bị hủy trước đó)
 *           - Hoặc không thuộc trạng thái cho phép hủy
 *       500:
 *         description: Lỗi server
 */
const cancelLabOrder = async (req, res, next) => {
    try {
        const { labOrderId } = req.params;
        const { reason } = req.body;
        const result = await labOrderService.cancelLabOrder(labOrderId, reason);
        res.status(StatusCodes.OK).json(result);
    } catch (e) {
        next(e);
    }
};

export const labOrderController = {
    createLabOrder,
    getLabOrderDetail,
    getLabOrders,
    deleteLabOrder,
    cancelLabOrder,
};
