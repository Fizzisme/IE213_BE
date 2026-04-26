/**
 * @swagger
 * components:
 *   schemas:
 *     CreateTestResultRequest:
 *       type: object
 *       required:
 *         - testType
 *         - rawData
 *       properties:
 *         testType:
 *           type: string
 *           enum: [DIABETES_TEST]
 *           example: DIABETES_TEST
 *         rawData:
 *           type: object
 *           description: Dữ liệu xét nghiệm thô, backend sẽ kết hợp với AI analysis nếu phù hợp
 *           example:
 *             pregnancies: 2
 *             glucose: 150
 *             bloodPressure: 85
 *             skinThickness: 20
 *             insulin: 90
 *             bmi: 31.2
 *             diabetesPedigreeFunction: 0.5
 *     TestResultBlockchainPayload:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Kết quả đã được lưu, vui lòng xác nhận giao dịch trên MetaMask
 *         testResultId:
 *           type: string
 *           example: 667777777777777777777777
 *         resultHash:
 *           type: string
 *           example: 0x8ef4d3c2b1a0f9876543210abcdefabcdefabcdefabcdefabcdefabcdef1234
 *         blockchain:
 *           allOf:
 *             - $ref: '#/components/schemas/BlockchainAction'
 *             - type: object
 *               properties:
 *                 method:
 *                   type: string
 *                   example: appendTestResult
 */

/**
 * @swagger
 * /v1/lab-techs/test-results:
 *   get:
 *     summary: Lấy danh sách kết quả xét nghiệm
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 */

/**
 * @swagger
 * /v1/lab-techs/medical-records/{medicalRecordId}/test-results:
 *   post:
 *     summary: Lab Tech tạo kết quả xét nghiệm và nhận metadata để ký appendTestResult trên MetaMask
 *     tags: [Lab Tech]
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
 *             $ref: '#/components/schemas/CreateTestResultRequest'
 *     responses:
 *       201:
 *         description: Tạo kết quả xét nghiệm thành công và trả blockchain metadata
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/TestResultBlockchainPayload'
 */

/**
 * @swagger
 * /v1/lab-techs/test-results/{testResultId}/verify-tx:
 *   post:
 *     summary: Verify giao dịch appendTestResult sau khi Lab Tech ký MetaMask
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: testResultId
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
 *         description: Đồng bộ thành công
 *       400:
 *         description: Tx sai contract, sai method, sai args hoặc sai ví signer
 */

/**
 * @swagger
 * /v1/lab-techs/medical-records:
 *   get:
 *     summary: Lấy danh sách hồ sơ bệnh án cho Lab Tech
 *     tags: [Lab Tech]
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
 *     responses:
 *       200:
 *         description: Lấy danh sách hồ sơ bệnh án thành công
 */

/**
 * @swagger
 * /v1/lab-techs/me:
 *   get:
 *     summary: Lấy hồ sơ lab tech hiện tại
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hồ sơ lab tech hiện tại
 */
