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
 *         - medicalRecordId
 *         - assignedLabTech
 *       properties:
 *         patientAddress:
 *           type: string
 *           description: Địa chỉ ví bệnh nhân (đã được bệnh nhân cấp quyền trước)
 *           example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *         medicalRecordId:
 *           type: string
 *           description: ID của hồ sơ bệnh án (bác sĩ phải chỉ rõ hồ sơ nào lab order này thuộc về)
 *           example: "6801a2b3c4d5e6f789012345"
 *         assignedLabTech:
 *           type: string
 *           description: "ID của lab tech được chỉ định để làm xét nghiệm (MongoDB ObjectId của user LAB_TECH). 🆕 V3 Update: Doctor specifies lab tech when creating order"
 *           example: "6801a2b3c4d5e6f789012346"
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
 *     summary: Chuẩn bị giao dịch tạo lab order (MetaMask prepare)
 *     description: |
 *       Bác sĩ tạo yêu cầu xét nghiệm cho bệnh nhân theo flow MetaMask.
 *       Điều kiện tiên quyết: Bệnh nhân PHẢI đã cấp quyền truy cập cho bác sĩ này (xem Step 2).
 *       Backend sẽ validate nghiệp vụ + tính keccak256 hash + trả unsigned tx để frontend ký/broadcast.
 *       Sau đó frontend gọi API /v1/lab-orders/confirm để backend xác nhận txHash và ghi DB.
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
 *         description: Chuẩn bị giao dịch thành công (trả txRequest cho MetaMask)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "CREATE_LAB_ORDER"
 *                 txRequest:
 *                   type: object
 *                   description: Dữ liệu frontend gửi vào `eth_sendTransaction`
 *                 suggestedTx:
 *                   type: object
 *                   description: Gợi ý gas/nonce để frontend tham khảo
 *                 details:
 *                   type: string
 *                   description: Thông tin nghiệp vụ để frontend gắn lại lúc confirm
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
 * /v1/lab-orders/confirm:
 *   post:
 *     summary: Xác nhận tạo lab order sau khi MetaMask ký
 *     description: |
 *       Frontend gọi endpoint này sau khi user ký và broadcast transaction addRecord.
 *       Backend verify txHash + function args + event RecordAdded, sau đó mới ghi MongoDB và audit log.
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.post('/confirm', verifyToken, authorizeRoles('DOCTOR'), labOrderController.confirmCreateLabOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/consent:
 *   patch:
 *     summary: Chuẩn bị giao dịch đồng ý xét nghiệm (MetaMask prepare)
 *     description: |
 *       Bệnh nhân xem thông tin lab order và xác nhận đồng ý thực hiện xét nghiệm.
 *       Chỉ bệnh nhân sở hữu order mới có quyền xác nhận.
 *       Backend chỉ validate và trả txRequest để frontend ký/broadcast qua MetaMask.
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
 *         description: Chuẩn bị giao dịch đồng ý thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "CONSENT_LAB_ORDER"
 *                 txRequest:
 *                   type: object
 *       400:
 *         description: Order không ở trạng thái ORDERED hoặc blockchain error
 *       403:
 *         description: Không phải bệnh nhân sở hữu order này
 */
Router.patch('/:id/consent', verifyToken, authorizeRoles('PATIENT'), ehrWorkflowController.consentToOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/consent/confirm:
 *   patch:
 *     summary: Xác nhận đồng ý xét nghiệm sau khi MetaMask ký
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.patch('/:id/consent/confirm', verifyToken, authorizeRoles('PATIENT'), ehrWorkflowController.confirmConsentToOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/receive:
 *   patch:
 *     summary: Chuẩn bị giao dịch tiếp nhận order (MetaMask prepare)
 *     description: |
 *       Lab Tech tiếp nhận lab order đã được bệnh nhân đồng ý (status = CONSENTED).
 *       Backend chỉ validate và trả txRequest để frontend ký/broadcast qua MetaMask.
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
 *         description: Chuẩn bị giao dịch tiếp nhận order thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "RECEIVE_LAB_ORDER"
 *                 txRequest:
 *                   type: object
 *       400:
 *         description: Order không ở trạng thái CONSENTED
 *       403:
 *         description: Không phải lab tech
 */
Router.patch('/:id/receive', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.receiveOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/receive/confirm:
 *   patch:
 *     summary: Xác nhận tiếp nhận order sau khi MetaMask ký
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.patch('/:id/receive/confirm', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.confirmReceiveOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/post-result:
 *   patch:
 *     summary: Chuẩn bị giao dịch post kết quả xét nghiệm (MetaMask prepare)
 *     description: |
 *       Lab Tech nhập kết quả xét nghiệm kỹ thuật (các chỉ số như glucose, HbA1c...).
 *       Backend tính keccak256 hash của kết quả + validate nghiệp vụ, sau đó trả txRequest để frontend ký/broadcast.
 *       Sau khi tx mined, frontend gọi endpoint confirm để backend ghi DB + audit.
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
 *         description: Chuẩn bị giao dịch post kết quả thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "POST_LAB_RESULT"
 *                 txRequest:
 *                   type: object
 *                 details:
 *                   type: object
 *       400:
 *         description: Order không ở trạng thái IN_PROGRESS hoặc blockchain error
 *       403:
 *         description: Không phải lab tech
 */
Router.patch('/:id/post-result', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.postLabResult);

/**
 * @swagger
 * /v1/lab-orders/{id}/post-result/confirm:
 *   patch:
 *     summary: Xác nhận post kết quả sau khi MetaMask ký
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.patch('/:id/post-result/confirm', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.confirmPostLabResult);

/**
 * @swagger
 * /v1/lab-orders/{id}/interpretation:
 *   patch:
 *     summary: Chuẩn bị giao dịch thêm diễn giải lâm sàng (MetaMask prepare)
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
 *       Backend tính keccak256 hash của diễn giải + validate nghiệp vụ, sau đó trả txRequest để frontend ký/broadcast.
 *       Frontend gọi endpoint confirm sau khi tx mined để backend cập nhật DB và audit.
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
 *         description: Chuẩn bị giao dịch thêm diễn giải thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "ADD_CLINICAL_INTERPRETATION"
 *                 txRequest:
 *                   type: object
 *       400:
 *         description: Order không ở trạng thái RESULT_POSTED hoặc blockchain error
 *       403:
 *         description: Không phải bác sĩ hoặc không có quyền với bệnh nhân này
 */
Router.patch('/:id/interpretation', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.addClinicalInterpretation);

/**
 * @swagger
 * /v1/lab-orders/{id}/interpretation/confirm:
 *   patch:
 *     summary: Xác nhận thêm diễn giải sau khi MetaMask ký
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.patch('/:id/interpretation/confirm', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.confirmClinicalInterpretation);

/**
 * @swagger
 * /v1/lab-orders/{id}/complete:
 *   patch:
 *     summary: Chuẩn bị giao dịch chốt hồ sơ (MetaMask prepare)
 *     description: |
 *       Bác sĩ xác nhận hồ sơ xét nghiệm hoàn tất.
 *       Backend chỉ validate và trả txRequest để frontend ký/broadcast qua MetaMask.
 *       Frontend gọi endpoint confirm để backend xác nhận txHash và cập nhật DB.
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
 *         description: Chuẩn bị giao dịch chốt hồ sơ thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask)."
 *                 action:
 *                   type: string
 *                   example: "COMPLETE_RECORD"
 *                 txRequest:
 *                   type: object
 *       400:
 *         description: Order không ở trạng thái DOCTOR_REVIEWED hoặc blockchain error
 *       403:
 *         description: Không phải bác sĩ hoặc không có quyền với bệnh nhân này
 */
Router.patch('/:id/complete', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.completeRecord);

/**
 * @swagger
 * /v1/lab-orders/{id}/complete/confirm:
 *   patch:
 *     summary: Xác nhận chốt hồ sơ sau khi MetaMask ký
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 */
Router.patch('/:id/complete/confirm', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.confirmCompleteRecord);

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
 * DEPRECATED ROUTE REMOVED
 * 
 * Old Route: PATCH /:id/status (was: labOrder.workflow.controller.updateSampleStatus)
 * Associated Dead Code:
 *  - src/controllers/labOrder.workflow.controller.js (DELETED)
 *  - src/services/labOrder.workflow.service.js (DELETED)
 * 
 * Replacement:
 * All workflow state transitions now go through ehrWorkflow service with proper:
 * Role-based access control
 * Blockchain integration
 * Patient consent validation
 * Audit trail
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
 *       Xóa lab order hoàn toàn từ hệ thống.
 *       
 *       CHỈ được phép nếu status = ORDERED (chưa ai tiếp nhận)
 *       
 *       Cleanup: Tự động remove lab order ID khỏi medical record.relatedLabOrderIds
 *       
 *       BẤT CÔNG KÍCH: Sẽ log audit trail
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
 *       Hủy lab order nhưng giữ lại dữ liệu (không xóa hoàn toàn).
 *       
 *       Status sẽ chuyển: {any} → CANCELLED
 *       
 *       Medical record VẪN giữ reference đến lab order này (để lịch sử)
 *       
 *       Lý do hủy sẽ được log trong audit trail
 *       
 *       Khác biệt:
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

/**
 * @swagger
 * /v1/lab-orders/assign:
 *   post:
 *     summary: Bác sĩ phân công order cho lab tech
 *     description: |
 *       Bác sĩ phân công một lab order (status = CONSENTED) cho một lab tech cụ thể.
 *       Chỉ bác sĩ đã tạo order mới được phép phân công.
 *       Lab tech sẽ chỉ thấy orders được phân công cho mình trong getLabOrders().
 *       
 *       **Dòng chảy:**
 *       1. Patient consents (status=CONSENTED, assignedLabTech=null)
 *       2. Doctor calls this endpoint → set assignedLabTech = lab_tech_id
 *       3. Lab tech logs in → GET /v1/lab-orders → sẽ thấy order này
 *       4. Lab tech accepts order → status=IN_PROGRESS
 *       5. Lab tech posts result → status=RESULT_POSTED
 *     tags: [LabOrder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - labOrderId
 *               - labTechId
 *             properties:
 *               labOrderId:
 *                 type: string
 *                 description: MongoDB ID của lab order (CONSENTED status)
 *                 example: "6801a2b3c4d5e6f789012345"
 *               labTechId:
 *                 type: string
 *                 description: MongoDB ID của lab tech user (role=LAB_TECH, status=ACTIVE)
 *                 example: "6851b2c3d4e5f6a789012365"
 *     responses:
 *       200:
 *         description: Phân công thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Phân công order thành công"
 *                 orderId:
 *                   type: string
 *                   example: "6801a2b3c4d5e6f789012345"
 *                 assignedLabTech:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                   example:
 *                     id: "6851b2c3d4e5f6a789012365"
 *                     name: "Nguyễn Thị B"
 *                     email: "lab_tech_b@example.com"
 *                 sampleStatus:
 *                   type: string
 *                   example: "CONSENTED"
 *       400:
 *         description: Order không ở status CONSENTED hoặc lab tech không hợp lệ
 *       403:
 *         description: Chỉ DOCTOR tạo order được phép
 *       404:
 *         description: Order hoặc lab tech không tìm thấy
 */
Router.post('/assign', verifyToken, authorizeRoles('DOCTOR'), labOrderController.assignLabOrderToTech);

export const labOrderRoute = Router;
