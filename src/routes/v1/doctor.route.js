import express from 'express';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { verifyToken } from '~/middlewares/verifyToken';
import checkAccessGrant from '~/middlewares/checkAccessGrant';
import fetchGrantedPatients from '~/middlewares/fetchGrantedPatients';
import { medicalRecordController } from '~/controllers/medicalRecord.controller';
import { medicalRecordValidation } from '~/validations/medicalRecord.validation';
import { patientController } from '~/controllers/patient.controller';

const Router = express.Router();

// Tất cả route /doctor/* đều phải qua verifyToken + requireAdmin
Router.use(verifyToken, authorizeRoles('DOCTOR'));

/**
 * DOCTOR API - Medical Records Structure
 * ============================================
 * 
 * USE THIS ENDPOINT WHEN:
 * 
 * 1. GET /v1/doctors/medical-records
 *    → Lấy WORKLIST (dashboard con cái records từ tất cả bệnh nhân)
 *    → Use case: Doctor view dashboard, need overview of all cases
 *    → Return: Array of records (filtered by granted patients + status)
 *    → Query params: ?status=WAITING_RESULT,HAS_RESULT
 * 
 * 2. GET /v1/doctors/patients/:patientId/medical-records
 *    → Lấy PATIENT HISTORY (tất cả records của 1 bệnh nhân cụ thể)
 *    → Use case: Click vào bệnh nhân → view all records cho patient này
 *    → Return: Array of records for this patient only (sorted by date)
 *    → Query params: ?status=COMPLETE (filter by status)
 * 
 * 3. GET /v1/doctors/medical-records/:medicalRecordId
 *    → Lấy CHI TIẾT 1 record (full details + lab orders)
 *    → Use case: Open a specific record → show everything (vitals, diagnosis, etc.)
 *    → Return: Single record object with all linked data
 *    → Security: Check blockchain access control
 * 
 * 4. POST /v1/doctors/patients/:patientId/medical-records
 *    → TẠO hồ sơ mới (NEW clinical exam)
 *    → Use case: Doctor starts new visit with patient
 *    → Payload: { chief_complaint, vital_signs, physical_exam, diagnosis (optional) }
 *    → Return: Created record object
 * 
 *     DON'T use /medical-records directly for single patient
 *    (Use /patients/:patientId/medical-records instead)
 * 
 *     DON'T create multiple ACTIVE records for same patient
 *    (DB constraint enforces: 1 patient = 1 ACTIVE record at a time)
 */

Router
   /**
    * @swagger
    * /v1/doctors/medical-records/{medicalRecordId}:
    *   get:
    *     summary: Lấy chi tiết hồ sơ bệnh án + tất cả lab orders liên quan
    *     tags: [DOCTOR - Medical Records]
    *     security:
    *       - bearerAuth: []
    *     description: |
    *       **[STATE MACHINE]** Lấy toàn bộ chi tiết hồ sơ bệnh án với trạng thái hiện tại.
    *       
    *       **Các Trạng Thái (Status States):**
    *       - `CREATED`: Vừa tạo, chưa tạo lab order
    *       - `WAITING_RESULT`: Đã tạo lab order (relatedLabOrderIds != []), chờ kết quả từ lab
    *       - `HAS_RESULT`: Lab đã post kết quả (từ Lab Tech)
    *       - `DIAGNOSED`: Doctor đã review kết quả & xác nhận chẩn đoán lâm sàng
    *       - `COMPLETE`: Hoàn thành - khi lab order được chốt (lab.sampleStatus = COMPLETE → MR.status = COMPLETE)
    *       
    *       **Two-Way Linking:**
    *       - relatedLabOrderIds: Array của tất cả lab order thuộc record này
    *       - Khi doctor tạo lab order → phải specify medicalRecordId (explicit, không auto-attach)
    *       - Khi lab order COMPLETE → medical record tự động sync COMPLETE
    *       - Nếu status = COMPLETE → không thể thêm lab order mới (phải tạo MR mới)
    *       
    *       **Data Contents:**
    *       - chief_complaint: Lý do bệnh nhân đến khám (REQUIRED when creating)
    *       - vital_signs: Các chỉ số sức khỏe cơ bản (nhiệt độ, nhịp tim, huyết áp)
    *       - physical_exam: Kết quả khám lâm sàng (throat, abdomen, lungs, etc.)
    *       - assessment: Đánh giá ban đầu của doctor
    *       - diagnosis: Chẩn đoán lâm sàng (trước lab results)
    *       - confirmedDiagnosis: Chẩn đoán xác nhận (sau khi review lab results)
    *     parameters:
    *       - in: path
    *         name: medicalRecordId
    *         required: true
    *         description: MongoDB ObjectId của hồ sơ bệnh án
    *         schema:
    *           type: string
    *           pattern: '^[0-9a-fA-F]{24}$'
    *     responses:
    *       200:
    *         description: "Thành công - Chi tiết hồ sơ với linking info"
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 _id:
    *                   type: string
    *                   example: "69ba902193958774013b93e9"
    *                 patientId:
    *                   type: string
    *                   example: "69b8e99ec5252c2810cda964"
    *                 status:
    *                   type: string
    *                   enum: [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE]
    *                   description: "Trạng thái hiện tại của hồ sơ"
    *                   example: "DIAGNOSED"
    *                 chief_complaint:
    *                   type: string
    *                   example: "Sốt cao 39°C, ho, mệt"
    *                 vital_signs:
    *                   type: object
    *                   properties:
    *                     temperature:
    *                       type: number
    *                       example: 39.0
    *                     heart_rate:
    *                       type: number
    *                       example: 98
    *                     blood_pressure:
    *                       type: string
    *                       example: "140/90"
    *                     respiratory_rate:
    *                       type: number
    *                   example: { temperature: 39, heart_rate: 98, blood_pressure: "140/90" }
    *                 physical_exam:
    *                   type: object
    *                   example: { throat: "đỏ, sưng", lungs: "bình thường", abdomen: "mềm, không đau" }
    *                 assessment:
    *                   type: string
    *                   example: "Viêm họng cấp, nghi ngờ có nhiễm trùng huyết"
    *                 diagnosis:
    *                   type: string
    *                   example: "Viêm họng, cảm sốt"
    *                 confirmedDiagnosis:
    *                   type: string
    *                   description: "Chẩn đoán xác nhận sau khi review lab results"
    *                   example: "Streptococcal pneumonia (confirmed by WBC count)"
    *                 relatedLabOrderIds:
    *                   type: array
    *                   description: "Array của tất cả lab order IDs cho hồ sơ này"
    *                   items:
    *                     type: string
    *                   example: ["69d867a894664aa591ff617d", "69d867a894664aa591ff617e"]
    *                 createdAt:
    *                   type: string
    *                   format: date-time
    *                   example: "2026-03-18T11:44:33.337Z"
    *       422:
    *         description: "Validation error - medicalRecordId không phải valid MongoDB ObjectId"
    *       404:
    *         description: "Không tìm thấy hồ sơ (không tồn tại hoặc bệnh nhân sai)"
    *       403:
    *         description: "Doctor không có quyền (chưa được cấp access từ bệnh nhân)"
    */
   .get(
      '/medical-records/:medicalRecordId',
      medicalRecordValidation.medicalRecordId,
      checkAccessGrant,  // ✅ Check access grant
      medicalRecordController.getDetail,
   )
   /**
    * @swagger
    * /v1/doctors/medical-records:
    *   get:
    *     summary: 📑 Lấy danh sách hồ sơ bệnh án (có thể filter theo status)
    *     tags: [DOCTOR - Medical Records]
    *     security:
    *       - bearerAuth: []
    *     description: |
    *       **[FILTERING]** Lấy danh sách tất cả hồ sơ bệnh án của các bệnh nhân mà doctor có quyền.
    *       
    *       **Status Filter (comma-separated):**
    *       - `CREATED`: Chưa tạo lab order
    *       - `WAITING_RESULT`: Chờ kết quả lab
    *       - `HAS_RESULT`: Lab đã post kết quả
    *       - `DIAGNOSED`: Doctor đã chẩn đoán
    *       - `COMPLETE`: Hoàn thành (lab order done → record synced to COMPLETE)
    *       
    *       **Use Cases:**
    *       - Filter `WAITING_RESULT` để xem bệnh nhân chờ kết quả lab
    *       - Filter `DIAGNOSED` để xem đơn chờ chốt
    *       - Filter `COMPLETE` để xem lịch sử đơn đã hoàn thành
    *       
    *       **Ví dụ URL:**
    *       - GET /v1/doctors/medical-records → tất cả
    *       - GET /v1/doctors/medical-records?status=WAITING_RESULT
    *       - GET /v1/doctors/medical-records?status=DIAGNOSED,HAS_RESULT
    *     parameters:
    *       - in: query
    *         name: status
    *         required: false
    *         schema:
    *           type: string
    *         description: "Filter theo status (comma-separated): CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE"
    *         example: "DIAGNOSED,HAS_RESULT"
    *     responses:
    *       200:
    *         description: "✅ Lấy danh sách thành công"
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 statusCode:
    *                   type: number
    *                   example: 200
    *                 message:
    *                   type: string
    *                   example: "Success"
    *                 data:
    *                   type: array
    *                   items:
    *                     type: object
    *                     properties:
    *                       _id:
    *                         type: string
    *                         example: "69ba902193958774013b93e9"
    *                       patientId:
    *                         type: string
    *                         example: "69b8e99ec5252c2810cda964"
    *                       status:
    *                         type: string
    *                         enum: [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE]
    *                         description: "Trạng thái hiện tại"
    *                         example: "DIAGNOSED"
    *                       chief_complaint:
    *                         type: string
    *                         example: "Sốt cao, ho"
    *                       diagnosis:
    *                         type: string
    *                         example: "Cảm cúm"
    *                       relatedLabOrderIds:
    *                         type: array
    *                         description: "Tất cả lab orders cho record này"
    *                         items:
    *                           type: string
    *                           example: "69d867a894664aa591ff617d"
    *                       createdAt:
    *                         type: string
    *                         format: date-time
    *                         example: "2026-03-18T11:44:33.337Z"
    *       400:
    *         description: "❌ Query không hợp lệ (ví dụ: status không hợp lệ)"
    *       401:
    *         description: "❌ Unauthorized - Missing or invalid JWT token"
    *       403:
    *         description: "❌ Forbidden - User is not DOCTOR role"
    * /v1/doctors/patients:
    *   get:
    *     summary: Lấy danh sách tất cả bệnh nhân
    *     tags: [DOCTOR]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - in: query
    *         name: page
    *         required: false
    *         schema:
    *           type: number
    *         example: 1
    *       - in: query
    *         name: limit
    *         required: false
    *         schema:
    *           type: number
    *         example: 10
    *     responses:
    *       200:
    *         description: Lấy danh sách bệnh nhân thành công
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 statusCode:
    *                   type: number
    *                   example: 200
    *                 message:
    *                   type: string
    *                   example: Success
    *                 data:
    *                   type: array
    *                   items:
    *                     type: object
    *                     properties:
    *                       id:
    *                         type: string
    *                         example: "69ba902193958774013b93e9"
    *                       fullName:
    *                         type: string
    *                         example: "Nguyễn Văn A"
    *                       gender:
    *                         type: string
    *                         enum: [M, F]
    *                         example: "M"
    *                       birthYear:
    *                         type: number
    *                         example: 2000
    *                       phoneNumber:
    *                         type: string
    *                         example: "0912345678"
    *                       createdAt:
    *                         type: string
    *                         example: "2026-03-18T11:44:33.337Z"
    *       401:
    *         description: Unauthorized
    *       403:
    *         description: Forbidden
    */
   .get('/patients', patientController.getAll)
   /**
    * @swagger
    * /v1/doctors/patients/{patientId}:
    *   get:
    *     summary: Lấy thông tin chi tiết bệnh nhân theo ID
    *     tags: [DOCTOR]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: patientId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         example: "69ba902193958774013b93e9"
    *     responses:
    *       200:
    *         description: Lấy thông tin bệnh nhân thành công
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 statusCode:
    *                   type: number
    *                   example: 200
    *                 message:
    *                   type: string
    *                   example: Success
    *                 data:
    *                   type: object
    *                   properties:
    *                     id:
    *                       type: string
    *                       example: "69ba902193958774013b93e9"
    *                     userId:
    *                       type: string
    *                       example: "69b8ebdde2fbbfead81f3502"
    *                     fullName:
    *                       type: string
    *                       example: "Nguyễn Văn A"
    *                     gender:
    *                       type: string
    *                       enum: [M, F]
    *                       example: "M"
    *                     birthYear:
    *                       type: number
    *                       example: 2000
    *                     phoneNumber:
    *                       type: string
    *                       example: "0912345678"
    *                     createdAt:
    *                       type: string
    *                       example: "2026-03-18T11:44:33.337Z"
    *       400:
    *         description: ID không hợp lệ
    *       401:
    *         description: Unauthorized
    *       404:
    *         description: Không tìm thấy bệnh nhân
    */
   .get('/patients/:patientId', patientController.getPatientById)
   /**
    * @swagger
    * /v1/doctors/patients/{patientId}/medical-records:
    *   post:
    *     summary: Bác sĩ tạo hồ sơ bệnh án
    *     tags: [DOCTOR]
    *     description: |
    *       Bác sĩ tạo hồ sơ bệnh án cho bệnh nhân sau khi khám.
    *       Điều kiện tiên quyết: Bệnh nhân phải cấp quyền truy cập cho bác sĩ này.
    *       Hồ sơ được lưu off-chain trong MongoDB với status = CREATED.
    *       Việc ghi blockchain chỉ xảy ra ở flow lab-order prepare/confirm riêng.
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: patientId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *           pattern: '^[0-9a-fA-F]{24}$'
    *         description: ID của bệnh nhân (MongoDB ObjectId)
    *         example: "69ce8d5f7f0f573cd0a67ba8"
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required:
    *               - chief_complaint
    *               - vital_signs
    *             properties:
    *               chief_complaint:
    *                 type: string
    *                 minLength: 5
    *                 maxLength: 1000
    *                 example: "Đau đầu, sốt cao 39 độ"
    *                 description: Triệu chứng chính khi khám
    *               vital_signs:
    *                 type: object
    *                 description: |
    *                   🆕 FLEXIBLE - Doctor records ANY vital signs needed for this patient
    *                   No predefined fields - use whatever measurements apply
    *                   Common examples: temperature, blood_pressure, heart_rate, respiratory_rate, SpO2, weight
    *                 example: 
    *                   temperature: 38.5
    *                   blood_pressure: "120/80"
    *                   heart_rate: 72
    *               physical_exam:
    *                 type: object
    *                 description: |
    *                   🆕 FLEXIBLE - Doctor records findings for body systems examined
    *                   No predefined regions - record whatever body systems were examined
    *                   Common examples: respiratory, cardiovascular, abdominal, neurological, HEENT (Head/Eyes/Ears/Nose/Throat)
    *                 example:
    *                   respiratory: "Clear to auscultation bilaterally"
    *                   cardiac: "Regular rate and rhythm, no murmurs"
    *                   abdominal: "Soft, non-tender, no hepatomegaly"
    *               assessment:
    *                 type: string
    *                 maxLength: 1000
    *                 example: "Chẩn đoán lâm sàng ban đầu: Cảm cúm"
    *                 description: "Đánh giá ban đầu (tùy chọn)"
    *               plan:
    *                 type: array
    *                 items:
    *                   type: string
    *                 example: ["Kê đơn thuốc hạ sốt", "Xét nghiệm máu", "Tái khám sau 3 ngày"]
    *                 description: "Kế hoạch điều trị (tùy chọn)"
    *               diagnosis:
    *                 type: string
    *                 minLength: 5
    *                 maxLength: 1000
    *                 example: "Cảm cúm, có dấu hiệu viêm xoang"
    *                 description: "Chẩn đoán ban đầu dựa trên triệu chứng và khám (tùy chọn)"
    *     responses:
    *       201:
    *         description: Tạo hồ sơ bệnh án thành công
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 medicalRecordId:
    *                   type: string
    *                   example: "69cef1a2b3c4d5e6f7890123"
    *                   description: "ID của hồ sơ bệnh án được tạo"
    *                 status:
    *                   type: string
    *                   example: "CREATED"
    *                   description: "Status (CREATED nếu không có diagnosis, DIAGNOSED nếu có)"
    *                 chief_complaint:
    *                   type: string
    *                   example: "Đau đầu, sốt cao 39 độ"
    *                   description: "Triệu chứng chính"
    *                 diagnosis:
    *                   type: string
    *                   example: "Cảm cúm"
    *                   description: "Chẩn đoán ban đầu (nếu được cung cấp)"
    *                 message:
    *                   type: string
    *                   example: "Tạo hồ sơ bệnh án thành công"
    *       400:
    *         description: Validation error hoặc không có quyền truy cập bệnh nhân
    *       401:
    *         description: Unauthorized
    *       403:
    *         description: Forbidden - Không phải bác sĩ hoặc không có quyền access
    */
   /**
    * @swagger
    * /v1/doctors/patients/{patientId}/medical-records:
    *   get:
    *     summary: Lấy danh sách tất cả medical records của 1 bệnh nhân
    *     tags: [DOCTOR - Medical Records]
    *     security:
    *       - bearerAuth: []
    *     description: |
    *       **[PATIENT-CENTRIC VIEW]** Lấy danh sách tất cả hồ sơ bệnh án của 1 bệnh nhân cụ thể.
    *       Doctor có thể xem nếu được bệnh nhân cấp quyền.
    *       
    *       **Status Filter (comma-separated):**
    *       - `CREATED`: Vừa tạo, chưa tạo lab order
    *       - `WAITING_RESULT`: Chờ kết quả lab
    *       - `HAS_RESULT`: Lab đã post kết quả
    *       - `DIAGNOSED`: Doctor đã chẩn đoán
    *       - `COMPLETE`: Hoàn thành
    *       
    *       **Use Cases:**
    *       - Doctor muốn xem lịch sử khám của 1 bệnh nhân
    *       - Xem các đơn khám trước đó (follow-up patient)
    *       - Filter theo status để xem đơn chưa hoàn thành
    *     parameters:
    *       - name: patientId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *           pattern: '^[0-9a-fA-F]{24}$'
    *         description: MongoDB ObjectId của bệnh nhân
    *         example: "69ce8d5f7f0f573cd0a67ba8"
    *       - in: query
    *         name: status
    *         required: false
    *         schema:
    *           type: string
    *         description: "Filter theo status (comma-separated)"
    *         example: "DIAGNOSED,HAS_RESULT"
    *     responses:
    *       200:
    *         description: "Lấy danh sách records thành công"
    *         content:
    *           application/json:
    *             schema:
    *               type: array
    *               items:
    *                 type: object
    *                 properties:
    *                   _id:
    *                     type: string
    *                     example: "69ba902193958774013b93e9"
    *                   patientId:
    *                     type: string
    *                     example: "69ce8d5f7f0f573cd0a67ba8"
    *                   status:
    *                     type: string
    *                     enum: [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE]
    *                   chief_complaint:
    *                     type: string
    *                     example: "Sốt cao, ho"
    *                   diagnosis:
    *                     type: string
    *                     example: "Cảm cúm"
    *                   createdAt:
    *                     type: string
    *                     format: date-time
    *       400:
    *         description: "patientId không hợp lệ"
    *       401:
    *         description: "Unauthorized"
    *       403:
    *         description: "Doctor không có quyền xem bệnh nhân này"
    */
   .get('/patients/:patientId/medical-records', medicalRecordController.getPatientMedicalRecords)
   .post('/patients/:patientId/medical-records', medicalRecordValidation.createNew, medicalRecordController.createNew)
   /**
    * @swagger
    * /v1/doctors/medical-records/{medicalRecordId}/complete:
    *   post:
    *     summary: Hoàn thành hồ sơ bệnh án (không lab order)
    *     tags: [DOCTOR - Medical Records]
    *     security:
    *       - bearerAuth: []
    *     description: |
    *       **[DIRECT COMPLETE - No Lab Order]** Hoàn thành hồ sơ bệnh án mà KHÔNG qua lab order.
    *       
    *       **Use Cases:**
    *       - Bệnh nhân đến khám, bác sĩ chẩn đoán lâm sàng → không cần xét nghiệm
    *       - Ví dụ: Viêm họng cấp, cảm cúm thông thường - khám lâm sàng đủ
    *       - Ví dụ: Tái khám, theo dõi + xác nhận diagnosis không thay đổi
    *       
    *       **Điều Kiện (PHẢI THỎA CẢ 2):**
    *       1. Hồ sơ PHẢI có diagnosis hoặc confirmedDiagnosis (bác sĩ đã chẩn đoán)
    *       2. Hồ sơ KHÔNG được có lab order liên quan (relatedLabOrderIds = [])
    *       
    *       **Khác với completeRecord (có lab order):**
    *       - completeRecord: Khi lab order COMPLETE → medical record sync COMPLETE (blockchain involved)
    *       - directCompleteRecord: Hoàn thành ngay mà không lab order (diagnosis lâm sàng đủ)
    *       
    *       **Flow:**
    *       1. Doctor tạo medical record + nhập chẩn đoán
    *       2. Doctor gọi endpoint này
    *       3. Status: DIAGNOSED/CREATED → COMPLETE
    *       4. Doctor có thể tạo medical record mới cho bệnh nhân
    *     parameters:
    *       - in: path
    *         name: medicalRecordId
    *         required: true
    *         description: MongoDB ObjectId của hồ sơ bệnh án
    *         schema:
    *           type: string
    *           pattern: '^[0-9a-fA-F]{24}$'
    *         example: "69cef1a2b3c4d5e6f7890123"
    *     responses:
    *       200:
    *         description: Hoàn thành thành công (không lab order)
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 message:
    *                   type: string
    *                   example: "Hoàn thành hồ sơ bệnh án thành công (không có xét nghiệm)"
    *                 medicalRecordId:
    *                   type: string
    *                   example: "69cef1a2b3c4d5e6f7890123"
    *                 status:
    *                   type: string
    *                   enum: [COMPLETE]
    *                   example: "COMPLETE"
    *                 diagnosis:
    *                   type: string
    *                   example: "Viêm họng cấp"
    *                 flowType:
    *                   type: string
    *                   enum: [DIRECT_COMPLETE_NO_LAB_ORDER]
    *                   description: "Loại workflow (không lab order)"
    *                 completedAt:
    *                   type: string
    *                   format: date-time
    *                   example: "2026-04-15T10:30:00.000Z"
    *       400:
    *         description: |
    *           Validation Error - Điều kiện không thỏa:
    *           - Hồ sơ không có diagnosis (phải có chẩn đoán)
    *           - Hồ sơ có lab order liên quan (phải complete qua lab order flow)
    *           - Hồ sơ đã COMPLETE trước đó (không thể complete lại)
    *       401:
    *         description: "Unauthorized - Missing or invalid JWT token"
    *       403:
    *         description: "Forbidden - User is not DOCTOR role"
    *       404:
    *         description: "Hồ sơ bệnh án không tìm thấy"
    *       500:
    *         description: "Server error"
    */
   .post('/medical-records/:medicalRecordId/complete', medicalRecordController.directCompleteRecord);

export const doctorRoute = Router;
