import express from 'express';
import { verifyToken } from '~/middlewares/verifyToken';
import { authorizeRoles } from '~/middlewares/authorizeRoles';
import { patientRecordController } from '~/controllers/patientRecord.controller';

const Router = express.Router();

// Tất cả route /patient-records/* đều phải qua verifyToken + PATIENT role
Router.use(verifyToken, authorizeRoles('PATIENT'));

/**
 * @swagger
 * components:
 *   schemas:
 *     VerifyHashRequest:
 *       type: object
 *       required:
 *         - recordId
 *         - computedHash
 *         - hashType
 *       properties:
 *         recordId:
 *           type: string
 *           description: ID của record trên blockchain
 *           example: "1"
 *         computedHash:
 *           type: string
 *           description: "keccak256 hash (computed from data stored in MongoDB), used to verify data integrity"
 *           example: "0xabc123def456789..."
 *         hashType:
 *           type: number
 *           description: "Loại hash: 0 = orderHash, 1 = labResultHash, 2 = interpretationHash"
 *           example: 1
 */

/**
 * @swagger
 * /v1/patient-records:
 *   get:
 *     summary: Bệnh nhân lấy danh sách tất cả record của mình (Step 9)
 *     description: |
 *       Bệnh nhân lấy danh sách tất cả các record xét nghiệm của mình từ blockchain.
 *       Backend gọi EHRManager.getPatientRecordIds(patient) để lấy danh sách recordId,
 *       sau đó gọi getRecord(recordId) cho từng record.
 *       Chỉ trả về metadata on-chain (hash, status, recordType), không bao gồm dữ liệu chi tiết (stored in MongoDB).
 *     tags: [Patient Records]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách record
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   recordId:
 *                     type: string
 *                     description: ID của record trên blockchain
 *                     example: "1"
 *                   patient:
 *                     type: string
 *                     description: Địa chỉ ví bệnh nhân
 *                     example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                   author:
 *                     type: string
 *                     description: Địa chỉ ví bác sĩ tạo order
 *                     example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                   recordType:
 *                     type: number
 *                     description: "Loại record: 0=GENERAL, 1=HIV_TEST, 2=DIABETES_TEST, 3=LAB_RESULT"
 *                     example: 2
 *                   status:
 *                     type: number
 *                     description: "Trạng thái: 0=ORDERED, 1=CONSENTED, 2=IN_PROGRESS, 3=RESULT_POSTED, 4=DOCTOR_REVIEWED, 5=COMPLETE"
 *                     example: 5
 *                   orderHash:
 *                     type: string
 *                     description: Hash của order metadata
 *                     example: "0xabc123..."
 *                   labResultHash:
 *                     type: string
 *                     description: Hash của kết quả xét nghiệm (bị lock sau khi post)
 *                     example: "0xdef456..."
 *                   interpretationHash:
 *                     type: string
 *                     description: Hash của diễn giải lâm sàng
 *                     example: "0x789abc..."
 *                   requiredLevel:
 *                     type: number
 *                     description: "Mức quyền yêu cầu: 2=FULL, 3=SENSITIVE"
 *                     example: 2
 *                   createdAt:
 *                     type: number
 *                     description: Thời điểm tạo (Unix timestamp)
 *                     example: 1711500000
 *       400:
 *         description: Lỗi blockchain
 *       403:
 *         description: Không phải bệnh nhân
 */
Router.get('/', patientRecordController.getMyRecords);

/**
 * @swagger
 * /v1/patient-records/{recordId}:
 *   get:
 *     summary: Bệnh nhân lấy chi tiết một record (Step 9)
 *     description: |
 *       Bệnh nhân lấy chi tiết một record cụ thể từ MongoDB.
 *       Backend truy vấn record từ database, lấy toàn bộ metadata đã lưu.
 *       Dữ liệu bao gồm:
 *       - Lớp 1: Order metadata (orderHash)
 *       - Lớp 2: Lab result (labResultHash)
 *       - Lớp 3: Clinical interpretation (interpretationHash)
 *       Endpoint này trả dữ liệu + trạng thái kiểm tra integrity từ bản ghi hiện có.
 *       Nếu cần verify hash on-chain một cách tường minh, dùng `/v1/patient-records/verify`.
 *     tags: [Patient Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của record trên blockchain
 *         example: "1"
 *     responses:
 *       200:
 *         description: Record details with data retrieved from MongoDB
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordId:
 *                   type: string
 *                   example: "1"
 *                 patient:
 *                   type: string
 *                   example: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
 *                 author:
 *                   type: string
 *                   example: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
 *                 recordType:
 *                   type: number
 *                   example: 2
 *                 status:
 *                   type: number
 *                   example: 5
 *                 orderHash:
 *                   type: string
 *                   example: "0xabc123..."
 *                 orderData:
 *                   type: object
 *                   description: Dữ liệu order từ MongoDB
 *                   example:
 *                     recordType: "DIABETES_TEST"
 *                     testsRequested:
 *                       - code: "GLUCOSE"
 *                         name: "Đường huyết lúc đói"
 *                     clinicalNote: "Theo dõi đường huyết"
 *                     sampleType: "blood"
 *                 labResultHash:
 *                   type: string
 *                   example: "0xdef456..."
 *                 labResultData:
 *                   type: object
 *                   description: Dữ liệu kết quả xét nghiệm từ MongoDB
 *                   example:
 *                     rawData:
 *                       glucose: 145
 *                       hba1c: 7.2
 *                     note: "Glucose và HbA1c cao"
 *                 interpretationHash:
 *                   type: string
 *                   example: "0x789abc..."
 *                 interpretationData:
 *                   type: object
 *                   description: Diễn giải lâm sàng từ MongoDB
 *                   example:
 *                     interpretation: "Kết quả cho thấy tiểu đường type 2"
 *                     recommendation: "Điều chỉnh chế độ ăn, tăng vận động"
 *                 verification:
 *                   type: object
 *                   description: Kết quả verify hash (true = dữ liệu toàn vẹn)
 *                   properties:
 *                     orderHashValid:
 *                       type: boolean
 *                       example: true
 *                     labResultHashValid:
 *                       type: boolean
 *                       example: true
 *                     interpretationHashValid:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Blockchain error or database error
 *       403:
 *         description: Không có quyền xem record này
 */
Router.get('/:recordId', patientRecordController.getRecordDetail);

/**
 * @swagger
 * /v1/patient-records/verify:
 *   post:
 *     summary: Bệnh nhân verify hash của record
 *     description: |
 *       Bệnh nhân tự tính hash từ dữ liệu trên MongoDB và so sánh với hash on-chain.
 *       Backend gọi EHRManager.verifyRecordHash(recordId, computedHash, hashType) on-chain.
 *       Nếu khớp → dữ liệu toàn vẹn. Nếu không → dữ liệu đã bị thay đổi.
 *     tags: [Patient Records]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyHashRequest'
 *           examples:
 *             verify_lab_result:
 *               summary: Verify hash của kết quả xét nghiệm
 *               value:
 *                 recordId: "1"
 *                 computedHash: "0xabc123def456789..."
 *                 hashType: 1
 *     responses:
 *       200:
 *         description: Kết quả verify
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                   description: "true = hash khớp (dữ liệu toàn vẹn), false = không khớp (dữ liệu bị tamper)"
 *                   example: true
 *       400:
 *         description: Lỗi dữ liệu
 */
Router.post('/verify', patientRecordController.verifyRecordHash);

export const patientRecordRoute = Router;
