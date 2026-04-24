/**
 * @swagger
 * v1/lab-tech/test-results:
 *   get:
 *     summary: Lấy danh sách kết quả xét nghiệm
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * v1/lab-tech//medical-records/:medicalRecordId/test-results:
 *   post:
 *     summary: Lab Tech tạo kết quả xét nghiệm
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: patientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: "64f1a2b3c4d5e6f789012345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - medicalRecordId
 *               - testType
 *               - rawData
 *             properties:
 *               medicalRecordId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f789012999"
 *               testType:
 *                 type: string
 *                 enum: [DIABETES_TEST]
 *                 example: "DIABETES_TEST"
 *               rawData:
 *                 type: object
 *                 description: "Dữ liệu xét nghiệm thô (linh hoạt theo từng loại test)"
 *                 example:
 *                   glucose: 140
 *                   insulin: 18
 *                   bmi: 25.6
 *                   age: 45
 *     responses:
 *       201:
 *         description: Tạo kết quả xét nghiệm thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * v1/labtehs/medical-records:
 *   get:
 *     summary: Lấy danh sách hồ sơ bệnh án (có thể filter theo status)
 *     tags: [Lab Tech]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: "Filter theo trạng thái, có thể truyền nhiều giá trị, ví dụ: CREATED,HAS_RESULT"
 *         example: "CREATED,HAS_RESULT"
 *     responses:
 *       200:
 *         description: Lấy danh sách hồ sơ bệnh án thành công
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
 *                       patientId:
 *                         type: string
 *                         example: "69b8e99ec5252c2810cda964"
 *                       type:
 *                         type: string
 *                         example: "DIABETES_TEST"
 *                       status:
 *                         type: string
 *                         example: "CREATED"
 *                       note:
 *                         type: string
 *                         example: "Test"
 *                       createdAt:
 *                         type: string
 *                         example: "2026-03-18T11:44:33.337Z"
 *       400:
 *         description: Query không hợp lệ
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
