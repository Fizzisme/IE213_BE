import express from 'express';
import { labOrderController } from '~/controllers/labOrder.controller';
import { ehrWorkflowController } from '~/controllers/ehrWorkflow.controller';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';

const Router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateLabOrderRequest:
 *       type: object
 *       required:
 *         - patientAddress
 *         - recordType
 *         - testsRequested
 *       properties:
 *         patientAddress:
 *           type: string
 *           description: Địa chỉ ví bệnh nhân (đã được bệnh nhân cấp quyền trước)
 *           example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *         recordType:
 *           type: string
 *           enum: [GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT]
 *           description: "Loại xét nghiệm: GENERAL(tổng quát), HIV_TEST(xét nghiệm HIV-cần quyền SENSITIVE), DIABETES_TEST(tiểu đường), LAB_RESULT(kết quả khác)"
 *           example: "DIABETES_TEST"
 *         testsRequested:
 *           type: array
 *           description: Danh sách các xét nghiệm cần thực hiện
 *           items:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 example: "GLUCOSE"
 *               name:
 *                 type: string
 *                 example: "Đường huyết lúc đói"
 *               note:
 *                 type: string
 *                 example: "Bệnh nhân cần nhịn ăn 8 tiếng"
 *         priority:
 *           type: string
 *           enum: [normal, urgent, emergency]
 *           description: Mức độ ưu tiên
 *           example: "normal"
 *         clinicalNote:
 *           type: string
 *           description: Ghi chú lâm sàng của bác sĩ
 *           example: "Bệnh nhân có triệu chứng tiểu đường type 2, cần xét nghiệm HbA1c và glucose"
 *         sampleType:
 *           type: string
 *           enum: [blood, urine, stool, swab, other]
 *           description: Loại mẫu cần lấy
 *           example: "blood"
 *         diagnosisCode:
 *           type: string
 *           description: Mã chẩn đoán ICD-10 (tùy chọn)
 *           example: "E11.9"
 */

/**
 * @swagger
 * /v1/lab-orders:
 *   post:
 *     summary: Bác sĩ tạo lab order (Step 3)
 *     description: |
 *       Bác sĩ tạo yêu cầu xét nghiệm cho bệnh nhân.
 *       Điều kiện tiên quyết: Bệnh nhân PHẢI đã cấp quyền truy cập cho bác sĩ này (xem Step 2).
 *       Backend sẽ: tính keccak256 hash của metadata → gọi EHRManager.addRecord() on-chain (metadata stored in MongoDB).
 *       Record trên blockchain sẽ có status = ORDERED.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLabOrderRequest'
 *           examples:
 *             diabetes_test:
 *               summary: Xét nghiệm tiểu đường
 *               value:
 *                 patientAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 recordType: "DIABETES_TEST"
 *                 testsRequested:
 *                   - code: "GLUCOSE"
 *                     name: "Đường huyết lúc đói"
 *                     note: "Nhịn ăn 8 tiếng"
 *                   - code: "HBA1C"
 *                     name: "Hemoglobin A1c"
 *                 priority: "normal"
 *                 clinicalNote: "Theo dõi đường huyết bệnh nhân tiểu đường type 2"
 *                 sampleType: "blood"
 *                 diagnosisCode: "E11.9"
 *             hiv_test:
 *               summary: Xét nghiệm HIV (cần quyền SENSITIVE)
 *               value:
 *                 patientAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 recordType: "HIV_TEST"
 *                 testsRequested:
 *                   - code: "HIV_AB"
 *                     name: "HIV Antibody Test"
 *                 priority: "urgent"
 *                 clinicalNote: "Xét nghiệm HIV định kỳ"
 *                 sampleType: "blood"
 *     responses:
 *       201:
 *         description: Tạo lab order thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordId:
 *                   type: string
 *                   description: ID của record trên blockchain
 *                   example: "1"
 *                 txHash:
 *                   type: string
 *                   description: Hash giao dịch blockchain
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "ORDERED"
 *                 labOrderId:
 *                   type: string
 *                   description: ID của lab order trong MongoDB
 *                   example: "6801a2b3c4d5e6f789012345"
 *                 orderHash:
 *                   type: string
 *                   description: keccak256 hash của metadata (lưu trên blockchain để verify)
 *                   example: "0xdef456..."
 *       400:
 *         description: Lỗi dữ liệu đầu vào, chưa được cấp quyền, hoặc blockchain error
 *       401:
 *         description: Token không hợp lệ
 *       403:
 *         description: Không phải bác sĩ
 */
Router.post('/', verifyToken, authorizeRoles('DOCTOR'), labOrderController.createLabOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/consent:
 *   patch:
 *     summary: Bệnh nhân xác nhận đồng ý (Step 4)
 *     description: |
 *       Bệnh nhân xem thông tin lab order và xác nhận đồng ý thực hiện xét nghiệm.
 *       Chỉ bệnh nhân sở hữu order mới có quyền xác nhận.
 *       Backend gọi EHRManager.updateRecordStatus(recordId, CONSENTED) on-chain.
 *       Nếu bệnh nhân không đồng ý, order ở trạng thái ORDERED và không được tiến hành.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     responses:
 *       200:
 *         description: Xác nhận đồng ý thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Xác nhận đồng ý thành công"
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "CONSENTED"
 *       400:
 *         description: Order không ở trạng thái ORDERED hoặc blockchain error
 *       403:
 *         description: Không phải bệnh nhân sở hữu order này
 */
Router.patch('/:id/consent', verifyToken, authorizeRoles('PATIENT'), ehrWorkflowController.consentToOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/receive:
 *   patch:
 *     summary: Lab Tech tiếp nhận order (Step 5)
 *     description: |
 *       Lab Tech tiếp nhận lab order đã được bệnh nhân đồng ý (status = CONSENTED).
 *       Backend gọi EHRManager.updateRecordStatus(recordId, IN_PROGRESS) on-chain.
 *       Chỉ lab record (GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT) mới được lab tech tiếp nhận.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     responses:
 *       200:
 *         description: Tiếp nhận order thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tiếp nhận order thành công"
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "IN_PROGRESS"
 *       400:
 *         description: Order không ở trạng thái CONSENTED
 *       403:
 *         description: Không phải lab tech
 */
Router.patch('/:id/receive', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.receiveOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/post-result:
 *   patch:
 *     summary: Lab Tech post kết quả xét nghiệm (Step 6)
 *     description: |
 *       Lab Tech nhập kết quả xét nghiệm kỹ thuật (các chỉ số như glucose, HbA1c...).
 *       Backend tính keccak256 hash của kết quả → gọi EHRManager.postLabResult() on-chain (data stored in MongoDB).
 *       Kết quả bị LOCK ngay sau khi post - không ai sửa được sau đó (kể cả bác sĩ hay admin).
 *       Status chuyển sang RESULT_POSTED.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PostLabResultRequest'
 *           examples:
 *             diabetes_result:
 *               summary: Kết quả xét nghiệm tiểu đường
 *               value:
 *                 rawData:
 *                   glucose: 145
 *                   hba1c: 7.2
 *                   unit: "mg/dL"
 *                   normalRange:
 *                     glucose: "70-100"
 *                     hba1c: "< 5.7"
 *                 note: "Glucose và HbA1c đều cao hơn bình thường, gợi ý tiểu đường type 2"
 *     responses:
 *       200:
 *         description: Post kết quả thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Post kết quả thành công"
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "RESULT_POSTED"
 *                 labResultHash:
 *                   type: string
 *                   description: keccak256 hash của kết quả (lưu trên blockchain để verify)
 *                   example: "0xdef456..."
 *       400:
 *         description: Order không ở trạng thái IN_PROGRESS hoặc blockchain error
 *       403:
 *         description: Không phải lab tech
 */
Router.patch('/:id/post-result', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.postLabResult);

/**
 * @swagger
 * /v1/lab-orders/{id}/interpretation:
 *   patch:
 *     summary: Bác sĩ thêm diễn giải lâm sàng (Step 7)
 *     description: |
 *       Bác sĩ xem kết quả kỹ thuật từ lab tech và nhập diễn giải lâm sàng (nhận định, khuyến nghị điều trị).
 *       
 *       � Medical Logic - Why confirmedDiagnosis is REQUIRED:
 *       - Initial diagnosis (at lab order creation) = hypothesis, not confirmed
 *       - Confirmed diagnosis (after reading lab results) = conclusion that can be COMPLETELY DIFFERENT
 *       - Example: Initial E11 (Suspected Type 2 Diabetes) → After HbA1c 5.8% → Pre-diabetes
 *       - NEVER auto-fill: requires explicit doctor confirmation to prevent EHR errors
 *       
 *       💡 UX Optimization - Frontend Pre-fill Strategy:
 *       - Backend: Keeps confirmedDiagnosis as REQUIRED
 *       - Frontend: When opening "Add Interpretation" form:
 *         1. Fetch medical record diagnosis
 *         2. Pre-fill confirmedDiagnosis field with current value
 *         3. Doctor reviews and modifies if needed
 *       - Result: Doctor vets every diagnosis, UX is seamless
 *       - Analogous to: Epic EHR, OpenMRS, production systems
 *       
 *       Backend tính keccak256 hash của diễn giải → gọi EHRManager.addClinicalInterpretation() on-chain (data stored in MongoDB).
 *       Diễn giải chỉ lưu hash on-chain, nội dung thực tế hoàn toàn off-chain (bảo mật).
 *       Status chuyển sang DOCTOR_REVIEWED.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClinicalInterpretationRequest'
 *           examples:
 *             diabetes_interpretation:
 *               summary: Diễn giải kết quả tiểu đường (with explicit confirmedDiagnosis)
 *               value:
 *                 interpretation: "Glucose 145 mg/dL (cao), HbA1c 7.2% (cao). Kết quả cho thấy bệnh nhân bị tiểu đường type 2, kiểm soát đường huyết chưa tốt."
 *                 recommendation: "1. Điều chỉnh chế độ ăn: giảm tinh bột, tăng rau xanh. 2. Tăng cường vận động 30 phút/ngày. 3. Tái khám sau 3 tháng để kiểm tra HbA1c. 4. Có thể cần điều chỉnh liều thuốc nếu đang dùng."
 *                 confirmedDiagnosis: "Tiểu đường type 2 (confirmed by HbA1c 7.2%)"
 *     responses:
 *       200:
 *         description: Thêm diễn giải thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Thêm diễn giải lâm sàng thành công"
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "DOCTOR_REVIEWED"
 *                 interpretationHash:
 *                   type: string
 *                   description: keccak256 hash của diễn giải (lưu trên blockchain để verify)
 *                   example: "0x789abc..."
 *       400:
 *         description: Order không ở trạng thái RESULT_POSTED hoặc blockchain error
 *       403:
 *         description: Không phải bác sĩ hoặc không có quyền với bệnh nhân này
 */
Router.patch('/:id/interpretation', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.addClinicalInterpretation);

/**
 * @swagger
 * /v1/lab-orders/{id}/complete:
 *   patch:
 *     summary: Bác sĩ chốt hồ sơ (Step 8)
 *     description: |
 *       Bác sĩ xác nhận hồ sơ xét nghiệm hoàn tất.
 *       Backend gọi EHRManager.updateRecordStatus(recordId, COMPLETE) on-chain.
 *       Sau khi COMPLETE, không ai được sửa bất kỳ field nào của record.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     responses:
 *       200:
 *         description: Chốt hồ sơ thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chốt hồ sơ thành công"
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 status:
 *                   type: string
 *                   example: "COMPLETE"
 *       400:
 *         description: Order không ở trạng thái DOCTOR_REVIEWED hoặc blockchain error
 *       403:
 *         description: Không phải bác sĩ hoặc không có quyền với bệnh nhân này
 */
Router.patch('/:id/complete', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.completeRecord);

/**
 * @swagger
 * /v1/lab-orders/{id}:
 *   get:
 *     summary: Lấy chi tiết lab order
 *     description: Lấy thông tin chi tiết của một lab order bao gồm cả dữ liệu on-chain và off-chain.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order (MongoDB ObjectId)
 *         example: "6801a2b3c4d5e6f789012345"
 *     responses:
 *       200:
 *         description: Chi tiết lab order
 *       404:
 *         description: Không tìm thấy lab order
 */
Router.get('/:id', verifyToken, labOrderController.getLabOrderDetail);

/**
 * @swagger
 * /v1/lab-orders:
 *   get:
 *     summary: Lấy danh sách lab orders
 *     description: |
 *       Lấy danh sách lab orders theo role:
 *       - DOCTOR: xem các order do mình tạo
 *       - LAB_TECH: xem các order đã tiếp nhận
 *       - PATIENT: xem các order của mình
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ORDERED, CONSENTED, IN_PROGRESS, RESULT_POSTED, DOCTOR_REVIEWED, COMPLETE]
 *         description: Lọc theo trạng thái
 *         example: "CONSENTED"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số lượng records mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách lab orders
 */
Router.get('/', verifyToken, labOrderController.getLabOrders);

/**
 * ⚠️ DEPRECATED ROUTE REMOVED
 * 
 * Old Route: PATCH /:id/status (was: labOrder.workflow.controller.updateSampleStatus)
 * Associated Dead Code:
 *  - src/controllers/labOrder.workflow.controller.js (DELETED)
 *  - src/services/labOrder.workflow.service.js (DELETED)
 * 
 * Replacement:
 * All workflow state transitions now go through ehrWorkflow service with proper:
 * ✅ Role-based access control
 * ✅ Blockchain integration
 * ✅ Patient consent validation
 * ✅ Audit trail
 * 
 * Workflow Endpoints:
 * - POST /v1/lab-orders/:id/consent (Patient consent)
 * - PATCH /v1/lab-orders/:id/receive (Lab tech receives)
 * - PATCH /v1/lab-orders/:id/results (Lab tech posts results)
 * - PATCH /v1/lab-orders/:id/interpretation (Doctor interprets)
 * - PATCH /v1/lab-orders/:id/complete (Doctor finalizes)
 * 
 * See: src/routes/v1/ehrWorkflow.route.js
 */
// Removed: Router.patch('/:id/status', verifyToken, labOrderWorkflowController.updateSampleStatus);

/**
 * @swagger
 * /v1/lab-orders/{labOrderId}:
 *   delete:
 *     summary: Xóa lab order và cleanup medical record linking
 *     description: |
 *       🗑️ Xóa lab order hoàn toàn từ hệ thống.
 *       
 *       ⚠️ CHỈ được phép nếu status = ORDERED (chưa ai tiếp nhận)
 *       
 *       🔗 Cleanup: Tự động remove lab order ID khỏi medical record.relatedLabOrderIds
 *       
 *       📝 BẤT CÔNG KÍCH: Sẽ log audit trail
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: labOrderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order cần xóa
 *         example: "69d867a894664aa591ff617d"
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lab order 69d867a894664aa591ff617d đã xóa thành công"
 *                 deletedLabOrderId:
 *                   type: string
 *                 cleanedFromMedicalRecordId:
 *                   type: string
 *       404:
 *         description: Lab order không tìm thấy
 *       409:
 *         description: Không thể xóa (status != ORDERED)
 */
Router.delete('/:labOrderId', verifyToken, labOrderController.deleteLabOrder);

/**
 * @swagger
 * /v1/lab-orders/{labOrderId}/cancel:
 *   patch:
 *     summary: Hủy lab order (giữ record, chỉ thay status)
 *     description: |
 *       ⛔ Hủy lab order nhưng giữ lại dữ liệu (không xóa hoàn toàn).
 *       
 *       Status sẽ chuyển: {any} → CANCELLED
 *       
 *       🔗 Medical record VẪN giữ reference đến lab order này (để lịch sử)
 *       
 *       📝 Lý do hủy sẽ được log trong audit trail
 *       
 *       💡 Khác biệt:
 *       - DELETE: Xóa hoàn toàn, cleanup linking (chỉ ORDERED status)
 *       - CANCEL: Giữ record, thay status thành CANCELLED (bất kỳ status)
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: labOrderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lab order cần hủy
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
 *                 description: Lý do hủy
 *                 example: "Bệnh nhân không Đồng ý"
 *     responses:
 *       200:
 *         description: Hủy thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lab order 69d867a894664aa591ff617d đã cancel thành công"
 *                 cancelledLabOrderId:
 *                   type: string
 *                 previousStatus:
 *                   type: string
 *                 newStatus:
 *                   type: string
 *                   example: "CANCELLED"
 *                 reason:
 *                   type: string
 *       404:
 *         description: Lab order không tìm thấy
 *       409:
 *         description: Không thể hủy (status = COMPLETE hoặc CANCELLED)
 */
Router.patch('/:labOrderId/cancel', verifyToken, labOrderController.cancelLabOrder);

export const labOrderRoute = Router;
