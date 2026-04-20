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
 *           description: "ID của lab tech được chỉ định để làm xét nghiệm (MongoDB ObjectId của user LAB_TECH). Cập nhật V3: Bác sĩ chỉ định lab tech khi tạo order"
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
 * /v1/lab-orders/{id}/prepare-consent:
 *   get:
 *     summary: Chuẩn bị unsigned transaction cho MetaMask signing (Step 4a)
 *     description: |
 *       METAMASK FLOW - Step 4a: Chuẩn bị
 *       
 *       Bệnh nhân gọi endpoint này để nhận unsigned transaction.
 *       Frontend dùng MetaMask ký transaction này.
 *       
 *       Thay vì backend ký dùm (cũ), bây giờ:
 *       1. Backend chuẩn bị unsigned tx + gas estimate
 *       2. Frontend ký với MetaMask (user confirm popup)
 *       3. Frontend gửi signed tx lên backend để broadcast
 *
 *       Returns: { unsignedTx, gasEstimate, estimatedCostEther, nonce, chainId }
 *       Frontend cần convert unsignedTx → MetaMask format + ký + gửi txHash qua Step 4b
 *     tags: [LabOrder, MetaMask]
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
 *         description: Unsigned transaction prepared, ready for MetaMask signing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     unsignedTx:
 *                       type: object
 *                       description: Unsigned transaction object (frontend ký với MetaMask)
 *                       properties:
 *                         to:
 *                           type: string
 *                           example: "0x5FbDB2315678afccb333f8a9c36c1da42109ffff"
 *                         from:
 *                           type: string
 *                           example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                         data:
 *                           type: string
 *                           description: Encoded function call (updateRecordStatus)
 *                         gasLimit:
 *                           type: string
 *                           example: "120000"
 *                         gasPrice:
 *                           type: string
 *                           example: "123456789"
 *                         nonce:
 *                           type: number
 *                           example: 5
 *                         chainId:
 *                           type: number
 *                           example: 11155111
 *                     gasEstimate:
 *                       type: string
 *                       description: Estimated gas (without buffer)
 *                       example: "100000"
 *                     estimatedCostEther:
 *                       type: string
 *                       description: Estimated gas cost in ETH
 *                       example: "0.012345"
 *       400:
 *         description: Order không ở trạng thái ORDERED, invalid address, hoặc gas estimation failed
 *       403:
 *         description: Không phải bệnh nhân sở hữu order này, hoặc account status != ACTIVE
 */
Router.get('/:id/prepare-consent', verifyToken, authorizeRoles('PATIENT'), ehrWorkflowController.prepareConsentToOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/consent/confirm:
 *   patch:
 *     summary: Xác nhận MetaMask signing, broadcast & update MongoDB (Step 4b)
 *     description: |
 *       LUỒNG METAMASK - Buớc 4b: Xác nhận
 *       
 *       Flow:
 *       1. Frontend gọi /prepare-consent → nhận unsignedTx
 *       2. Frontend dùng MetaMask ký → nhận signedTx
 *       3. Frontend gọi endpoint này với { txHash } từ signed tx
 *       4. Backend verify txHash trên blockchain
 *       5. Backend extract msg.sender từ blockchain tx
 *       6. Backend verify signer = hiện tại user
 *       7. Backend update MongoDB + audit log
 *       
 *       Response: { txHash, blockNumber, status: CONSENTED }
 *     tags: [LabOrder, MetaMask]
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
 *             type: object
 *             required:
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 description: Transaction hash từ signed tx (frontend cung cấp)
 *                 example: "0xabc123def456..."
 *     responses:
 *       200:
 *         description: Transaction confirmed trên blockchain, MongoDB updated
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
 *                   example: "Xác nhận đồng ý thành công (frontend signed with MetaMask)"
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                       example: "6801a2b3c4d5e6f789012345"
 *                     txHash:
 *                       type: string
 *                       example: "0xabc123def456..."
 *                     blockNumber:
 *                       type: number
 *                       example: 5612345
 *                     status:
 *                       type: string
 *                       example: "CONSENTED"
 *       400:
 *         description: Invalid txHash, transaction not confirmed, order wrong status
 *       403:
 *         description: Signer không match user hiện tại
 */
Router.patch('/:id/consent/confirm', verifyToken, authorizeRoles('PATIENT'), ehrWorkflowController.confirmConsentToOrder);

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
 *                 orderId:
 *                   type: string
 *                   example: "6801a2b3c4d5e6f789012345"
 *                 blockchainRecordId:
 *                   type: string
 *                   example: "0x123abc..."
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
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-04-18T15:30:45.123Z"
 *                 testResultId:
 *                   type: string
 *                   description: MongoDB ID của test result được tạo (null nếu fail)
 *                   example: "6801xyz789def..."
 *                   nullable: true
 *                 testResultStatus:
 *                   type: string
 *                   enum: [SUCCESS, FAILED, PENDING]
 *                   description: Kết quả của quá trình retry tạo TestResult (Issue B fix)
 *                   example: "SUCCESS"
 *                 testResultRetryCount:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 3
 *                   description: Số lần đã retry khi tạo TestResult (exponential backoff 1s→2s→4s)
 *                   example: 1
 *                 testResultError:
 *                   type: string
 *                   description: Error message nếu TestResult fail sau 3 lần retry (null nếu success)
 *                   example: null
 *                   nullable: true
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

/**
 * @swagger
 * /v1/admin/lab-orders/assign:
 *   post:
 *     summary: Admin phân công order cho lab tech (Vấn đề 3 - Fix)
 *     description: |
 *       Admin phân công một lab order (status = CONSENTED) cho một lab tech cụ thể.
 *       Lab tech sẽ chỉ thấy orders được phân công cho mình trong getLabOrders().
 *       
 *       **Dòng chảy:**
 *       1. Patient consents (status=CONSENTED, assignedLabTech=null)
 *       2. Admin calls this endpoint → set assignedLabTech = lab_tech_id
 *       3. Lab tech logs in → GET /v1/lab-orders → sẽ thấy order này
 *       4. Lab tech accepts order → status=IN_PROGRESS
 *       5. Lab tech posts result → status=RESULT_POSTED
 *     tags: [Admin]
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
 *         description: Chỉ ADMIN được phép
 *       404:
 *         description: Order hoặc lab tech không tìm thấy
 */
Router.post('/admin/assign', verifyToken, authorizeRoles('ADMIN'), labOrderController.assignLabOrderToTech);

// ==============================================================================
// LUỒNG METAMASK: BÁC SĨ - Thêm Hồ SƠ
// ==============================================================================

/**
 * @swagger
 * /v1/lab-orders/create/prepare:
 *   post:
 *     summary: Chuẩn bị unsigned transaction cho bác sĩ tạo lab order (MetaMask Flow - Step 1a)
 *     description: |
 *       Bác sĩ gọi endpoint này để nhận unsigned transaction cho việc tạo lab order trên blockchain.
 *       Frontend dùng MetaMask ký transaction này, sau đó confirm via /create/confirm.
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patientAddress:
 *                 type: string
 *                 example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *               recordType:
 *                 type: integer
 *                 example: 1
 *               requiredLevel:
 *                 type: integer
 *                 example: 2
 *               orderHash:
 *                 type: string
 *                 example: "0x123abc456def..."
 *     responses:
 *       200:
 *         description: Unsigned transaction prepared
 */
Router.post('/create/prepare', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.prepareAddRecord);

/**
 * @swagger
 * /v1/lab-orders/create/confirm:
 *   post:
 *     summary: Xác nhận giao dịch tạo lab order sau khi ký MetaMask (Step 1b)
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0x123abc456def789..."
 *     responses:
 *       200:
 *         description: Lab order created successfully
 */
Router.post('/create/confirm', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.confirmAddRecord);

// ==============================================================================
// LUỒNG METAMASK: BÁC SĨ - Giải Thích LAm Sàng
// ==============================================================================

/**
 * @swagger
 * /v1/lab-orders/{id}/interpretation/prepare:
 *   post:
 *     summary: Chuẩn bị unsigned transaction cho bác sĩ thêm giải thích lâm sàng (MetaMask Flow - Step 2a)
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interpretationHash:
 *                 type: string
 *                 example: "0x123abc456def..."
 *     responses:
 *       200:
 *         description: Unsigned transaction prepared
 */
Router.post('/:id/interpretation/prepare', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.prepareInterpretation);

/**
 * @swagger
 * /v1/lab-orders/{id}/interpretation/confirm:
 *   post:
 *     summary: Xác nhận giao dịch thêm giải thích lâm sàng sau khi ký MetaMask (Step 2b)
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0x123abc456def789..."
 *     responses:
 *       200:
 *         description: Interpretation added successfully
 */
Router.post('/:id/interpretation/confirm', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.confirmInterpretation);

// ==============================================================================
// LUỒNG METAMASK: BÁC SĨ - Hoàn Thành
// ==============================================================================

/**
 * @swagger
 * /v1/lab-orders/{id}/complete/prepare:
 *   post:
 *     summary: Chuẩn bị unsigned transaction cho bác sĩ hoàn thành record (MetaMask Flow - Step 3a)
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unsigned transaction prepared
 */
Router.post('/:id/complete/prepare', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.prepareComplete);

/**
 * @swagger
 * /v1/lab-orders/{id}/complete/confirm:
 *   post:
 *     summary: Xác nhận giao dịch hoàn thành record sau khi ký MetaMask (Step 3b)
 *     tags: [LabOrder, MetaMask, Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0x123abc456def789..."
 *     responses:
 *       200:
 *         description: Record completed successfully
 */
Router.post('/:id/complete/confirm', verifyToken, authorizeRoles('DOCTOR'), ehrWorkflowController.confirmComplete);

// ==============================================================================
// LUỒNG METAMASK: LAB TECH - Tiếp Nhẫn Order
// ==============================================================================

/**
 * @swagger
 * /v1/lab-orders/{id}/receive/prepare:
 *   post:
 *     summary: Chuẩn bị unsigned transaction cho lab tech nhận order (MetaMask Flow - Step 4a)
 *     tags: [LabOrder, MetaMask, LabTech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unsigned transaction prepared
 */
Router.post('/:id/receive/prepare', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.prepareReceiveOrder);

/**
 * @swagger
 * /v1/lab-orders/{id}/receive/confirm:
 *   post:
 *     summary: Xác nhận giao dịch nhận order sau khi ký MetaMask (Step 4b)
 *     tags: [LabOrder, MetaMask, LabTech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0x123abc456def789..."
 *     responses:
 *       200:
 *         description: Order received successfully
 */
Router.post('/:id/receive/confirm', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.confirmReceiveOrder);

// ==============================================================================
// LUỒNG METAMASK: LAB TECH - Gửi Kết Quả
// ==============================================================================

/**
 * @swagger
 * /v1/lab-orders/{id}/post-result/prepare:
 *   post:
 *     summary: Chuẩn bị unsigned transaction cho lab tech gửi kết quả (MetaMask Flow - Step 5a)
 *     tags: [LabOrder, MetaMask, LabTech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               labResultHash:
 *                 type: string
 *                 example: "0x123abc456def..."
 *     responses:
 *       200:
 *         description: Unsigned transaction prepared
 */
Router.post('/:id/post-result/prepare', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.preparePostResult);

/**
 * @swagger
 * /v1/lab-orders/{id}/post-result/confirm:
 *   post:
 *     summary: Xác nhận giao dịch gửi kết quả sau khi ký MetaMask (Step 5b)
 *     tags: [LabOrder, MetaMask, LabTech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txHash:
 *                 type: string
 *                 example: "0x123abc456def789..."
 *     responses:
 *       200:
 *         description: Lab result posted successfully
 */
Router.post('/:id/post-result/confirm', verifyToken, authorizeRoles('LAB_TECH'), ehrWorkflowController.confirmPostResult);

export const labOrderRoute = Router;
