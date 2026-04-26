/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalRecordCreateRequest:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           enum: [HIV_TEST, LAB_RESULT, PRESCRIPTION, DIABETES_TEST]
 *           example: DIABETES_TEST
 *         note:
 *           type: string
 *           maxLength: 500
 *           example: Bệnh nhân khát nước, tiểu nhiều, nghi tăng đường huyết
 *     MedicalRecordDiagnosisRequest:
 *       type: object
 *       required:
 *         - testResultId
 *         - diagnosis
 *       properties:
 *         testResultId:
 *           type: string
 *           example: 663333333333333333333333
 *         note:
 *           type: string
 *           maxLength: 500
 *           example: Điều trị insulin và tái khám sau 2 tuần
 *         diagnosis:
 *           type: string
 *           minLength: 1
 *           maxLength: 1000
 *           example: Tiểu đường tuýp 2
 *     MedicalRecordBlockchainPayload:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         medicalRecordId:
 *           type: string
 *         patientWallet:
 *           type: string
 *           nullable: true
 *         recordHash:
 *           type: string
 *           nullable: true
 *         diagnosisHash:
 *           type: string
 *           nullable: true
 *         blockchain:
 *           allOf:
 *             - $ref: '#/components/schemas/BlockchainAction'
 *             - type: object
 *               properties:
 *                 method:
 *                   type: string
 *                   example: createRecord
 *     MedicalRecordSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         type:
 *           type: string
 *           example: DIABETES_TEST
 *         status:
 *           type: string
 *           enum: [CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED, COMPLETE]
 *         clinicalNote:
 *           type: string
 *           nullable: true
 *         diagnosisNote:
 *           type: string
 *           nullable: true
 *         note:
 *           type: string
 *           nullable: true
 *         diagnosis:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         patientInfo:
 *           type: object
 *           nullable: true
 *     TestResultItem:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         medicalRecordId:
 *           type: string
 *         patientId:
 *           type: string
 *         createdBy:
 *           type: string
 *         testType:
 *           type: string
 *           example: DIABETES_TEST
 *         rawData:
 *           type: object
 *         aiAnalysis:
 *           type: object
 *         blockchainMetadata:
 *           type: object
 *           properties:
 *             isSynced:
 *               type: boolean
 *             txHash:
 *               type: string
 *             syncAt:
 *               type: string
 *               format: date-time
 *     IntegrityResult:
 *       type: object
 *       properties:
 *         medicalRecordId:
 *           type: string
 *         isValid:
 *           type: boolean
 *         status:
 *           type: string
 *           example: COMPLETE
 *         failedAt:
 *           type: string
 *           nullable: true
 *           example: HAS_RESULT
 *         message:
 *           type: string
 *           nullable: true
 */

/**
 * @swagger
 * /v1/doctors/appointments:
 *   get:
 *     summary: Lấy danh sách lịch hẹn của bác sĩ hiện tại
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch hẹn của bác sĩ
 */

/**
 * @swagger
 * /v1/doctors/medical-records/{medicalRecordId}:
 *   get:
 *     summary: Lấy chi tiết hồ sơ bệnh án
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: medicalRecordId
 *         required: true
 *         description: ID của hồ sơ bệnh án (MongoDB ObjectId)
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Doctor không có quyền truy cập hồ sơ này trên Blockchain
 *       422:
 *         description: Validation error
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /v1/doctors/medical-records:
 *   get:
 *     summary: Lấy danh sách hồ sơ bệnh án, có thể filter theo status và từ khóa
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter theo trạng thái, có thể truyền nhiều giá trị, ví dụ CREATED,HAS_RESULT
 *         example: CREATED,HAS_RESULT
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         example: desc
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Tìm theo tên hoặc số điện thoại bệnh nhân
 *     responses:
 *       200:
 *         description: Lấy danh sách hồ sơ bệnh án thành công
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MedicalRecordSummary'
 */

/**
 * @swagger
 * /v1/doctors/test-results/{testResultId}:
 *   get:
 *     summary: Lấy chi tiết kết quả xét nghiệm
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testResultId
 *         required: true
 *         description: ID kết quả xét nghiệm (MongoDB ObjectId)
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Lấy thành công
 */

/**
 * @swagger
 * /v1/doctors/test-results:
 *   get:
 *     summary: Lấy danh sách kết quả xét nghiệm
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 */

/**
 * @swagger
 * /v1/doctors/patients:
 *   get:
 *     summary: Lấy danh sách tất cả bệnh nhân
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách bệnh nhân thành công
 */

/**
 * @swagger
 * /v1/doctors/patients/{patientId}:
 *   get:
 *     summary: Lấy thông tin chi tiết bệnh nhân theo ID
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: patientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: 69ba902193958774013b93e9
 *     responses:
 *       200:
 *         description: Lấy thông tin bệnh nhân thành công
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy bệnh nhân
 */

/**
 * @swagger
 * /v1/doctors/patients/{patientId}/medical-records:
 *   get:
 *     summary: Lấy toàn bộ hồ sơ bệnh án của một bệnh nhân
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: patientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: 64f1a2b3c4d5e6f789012345
 *     responses:
 *       200:
 *         description: Danh sách hồ sơ bệnh án của bệnh nhân
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MedicalRecordSummary'
 *       403:
 *         description: Doctor không có quyền truy cập hồ sơ của bệnh nhân này trên Blockchain
 *   post:
 *     summary: Doctor tạo hồ sơ bệnh án và nhận metadata để ký createRecord trên MetaMask
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: patientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: 64f1a2b3c4d5e6f789012345
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedicalRecordCreateRequest'
 *     responses:
 *       201:
 *         description: Tạo hồ sơ bệnh án thành công và trả blockchain metadata
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/MedicalRecordBlockchainPayload'
 *             example:
 *               statusCode: 201
 *               message: Created
 *               data:
 *                 message: Hồ sơ đã được lưu, vui lòng xác nhận giao dịch trên MetaMask
 *                 medicalRecordId: 665555555555555555555555
 *                 patientWallet: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                 recordHash: 0x7ef4d3c2b1a0f9876543210abcdefabcdefabcdefabcdefabcdefabcdef1234
 *                 blockchain:
 *                   contractAddress: 0x1234567890abcdef1234567890abcdef12345678
 *                   method: createRecord
 *                   args:
 *                     - 665555555555555555555555
 *                     - 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 *                     - 0x7ef4d3c2b1a0f9876543210abcdefabcdefabcdefabcdefabcdefabcdef1234
 */

/**
 * @swagger
 * /v1/doctors/medical-records/{medicalRecordId}/diagnosis:
 *   patch:
 *     summary: Doctor chẩn đoán hồ sơ và nhận metadata để ký closeRecord trên MetaMask
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: medicalRecordId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: 64f1a2b3c4d5e6f789012345
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedicalRecordDiagnosisRequest'
 *     responses:
 *       200:
 *         description: Chẩn đoán thành công và trả blockchain metadata
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/MedicalRecordBlockchainPayload'
 *       400:
 *         description: Hồ sơ chưa có kết quả xét nghiệm hoặc đã hoàn thành
 */

/**
 * @swagger
 * /v1/doctors/medical-records/{medicalRecordId}/verify:
 *   get:
 *     summary: Kiểm tra tính toàn vẹn dữ liệu với Blockchain
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: medicalRecordId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trả về kết quả đối soát hash qua các tầng CREATED/HAS_RESULT/DIAGNOSED
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/IntegrityResult'
 */

/**
 * @swagger
 * /v1/doctors/medical-records/{medicalRecordId}/verify-tx:
 *   post:
 *     summary: Verify giao dịch createRecord hoặc closeRecord sau khi doctor ký MetaMask
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: medicalRecordId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyTxRequest'
 *     responses:
 *       200:
 *         description: Đồng bộ Blockchain thành công
 *       400:
 *         description: Tx sai contract, sai method, sai args hoặc sai ví signer
 */

/**
 * @swagger
 * /v1/doctors/me:
 *   get:
 *     summary: Lấy hồ sơ bác sĩ hiện tại
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hồ sơ bác sĩ hiện tại
 */
