import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { labOrderModel } from '~/models/labOrder.model';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
import { medicalRecordService } from '~/services/medicalRecord.service';
import { AI_SERVICE_URL } from '~/utils/constants';
import { ethers } from 'ethers';
import { normalizeWalletAddress, compareWalletAddresses } from '~/utils/wallet';  // [Sửa #5] Utility ví tập trung
import metaMaskTxBuilder, { verifyTransactionOnBlockchain } from '~/utils/metaMaskTxBuilder';

// ============================================================================
// CONSTANTS: Trạng thái TestResult + Chiến lược xử lý lỗi
// ============================================================================

/**
 * TEST_RESULT_STATUS: Trạng thái của kết quả xét nghiệm
 * - PENDING: Chờ AI phân tích (mới tạo)
 * - PROCESSING: AI đang chạy
 * - SUCCESS: Hoàn tất, có kết quả
 * - FAILED: Thất bại, có thể retry lại
 */
const TEST_RESULT_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
};

/**
 * ERROR_HANDLING_STRATEGY (Documentation)
 * ====================================
 * BLOCKING (Fail-fast):
 *   - Khi: Dữ liệu bắt buộc, bảo mật, consistency
 *   - Ví dụ: confirmedDiagnosis required, role DOCTOR, signer match
 *   - Ảnh hưởng: Main flow dừng ngay, client biết error
 *
 * NON-BLOCKING + RETRY (Resilient):
 *   - Khi: External service (FastAPI, cache), optional metadata
 *   - Ví dụ: AI analysis timeout, TestResult creation fail
 *   - Ảnh hưởng: Main flow tiếp tục, error xử lý async, có retry
 *
 * DECISION MATRIX:
 * +─────────────────────────────────────────────────────────────────+
 * | Scenario                | Strategy              | Reason        |
 * ├─────────────────────────────────────────────────────────────────┤
 * | Field required          | BLOCKING              | Data integrity|
 * | Auth / Authorization    | BLOCKING              | Security      |
 * | Blockchain conflicts    | BLOCKING              | Immutability  |
 * | State violations        | BLOCKING              | Consistency   |
 * | External service fail   | NON-BLOCKING + RETRY  | Resilience    |
 * | Optional metadata       | NON-BLOCKING          | UX            |
 * | Async operations        | NON-BLOCKING + QUEUE  | Eventually ok |
 * +─────────────────────────────────────────────────────────────────+
 */

/**
 * [Sửa #1 & #2 ưu tiên cao] Hàm helper cho xác thực role & status
 * Thay vì chỉ tin middleware, verify lại trong service
 */

// Helper: Xác thực user là ACTIVE (Issue #2 - Query DB real-time, không tin JWT token)
const validateUserIsActive = async (userId, requiredRole = null) => {
    const user = await userModel.findById(userId);

    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy user');
    }

    if (user._destroy || user.isDeleted) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản user đã bị xóa');
    }

    // Kiểm tra status ACTIVE (Issue #2)
    if (user.status !== 'ACTIVE') {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Your account is ${user.status}. Only ACTIVE users can perform this action`
        );
    }

    // Xác thực role cụ thể
    if (requiredRole && user.role !== requiredRole) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Only ${requiredRole} can perform this action. Your role: ${user.role}`
        );
    }

    return user;
};

// Helper: Xác thực role (Issue #1 - Bảo vệ sâu từng lớp, không chỉ tin middleware)
const verifyRole = async (currentUser, requiredRole) => {
    const user = await validateUserIsActive(currentUser._id, requiredRole);
    return user;
};

const toHexChainId = (chainId) => `0x${Number(chainId).toString(16)}`;

const buildPrepareResponse = (action, preparedTx, details = {}) => {
    const { unsignedTx, chainId, functionSignature } = preparedTx;

    return {
        message: 'Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).',
        action,
        txRequest: {
            to: unsignedTx.to,
            data: unsignedTx.data,
            value: unsignedTx.value || '0',
            chainId: toHexChainId(chainId),
        },
        suggestedTx: {
            from: unsignedTx.from,
            gasLimit: unsignedTx.gasLimit,
            gasPrice: unsignedTx.gasPrice,
            nonce: unsignedTx.nonce,
        },
        details: {
            functionSignature,
            chainId: Number(chainId),
            ...details,
        },
    };
};

const verifyConfirmedTxByUser = async (walletAddress, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận giao dịch');
    }

    const verification = await verifyTransactionOnBlockchain(txHash);

    if (!verification.found) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy giao dịch trên blockchain');
    }

    if (!verification.confirmed) {
        throw new ApiError(StatusCodes.CONFLICT, 'Giao dịch chưa được xác nhận trên blockchain');
    }

    if (verification.status !== 'SUCCESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại trên blockchain');
    }

    const txFrom = verification.from?.toLowerCase();
    const userWallet = walletAddress?.toLowerCase();
    if (!txFrom || !userWallet || txFrom !== userWallet) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Giao dịch không thuộc về user hiện tại. tx.from=${verification.from}, user.wallet=${walletAddress}`
        );
    }

    return verification;
};

const verifyTxFunctionCall = async ({ txHash, contract, functionName, argsValidator }) => {
    const tx = await blockchainContracts.provider.getTransaction(txHash);
    if (!tx) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy transaction data');
    }

    if (!tx.to || tx.to.toLowerCase() !== contract.target.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch không gửi tới contract đích');
    }

    const parsed = contract.interface.parseTransaction({
        data: tx.data,
        value: tx.value,
    });

    if (!parsed || parsed.name !== functionName) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch không gọi đúng hàm ${functionName}`);
    }

    if (typeof argsValidator === 'function') {
        const validArgs = argsValidator(parsed.args);
        if (!validArgs) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Args không khớp cho hàm ${functionName}`);
        }
    }
};

// ============================================================================
// HELPER: Tạo TestResult với retry logic (Issue B - High Priority)
// ============================================================================

/**
 * createTestResultWithRetry: Tạo TestResult với exponential backoff retry
 *
 * Vấn đề cũ:
 * - FastAPI timeout → TestResult creation fail → mất forever (không retry)
 * - Client không biết status của TestResult (null khó debug)
 *
 * Giải pháp:
 * - Retry 3 lần với exponential backoff (1s, 2s, 4s)
 * - Track testResultStatus (PENDING, PROCESSING, SUCCESS, FAILED)
 * - Client biết exact status + retry count
 *
 * @param {Object} testResultData - Dữ liệu để tạo TestResult
 * @param {number} maxRetries - Số lần retry (default = 3)
 * @returns {Object} { success, testResult, attempt, error }
 */
const createTestResultWithRetry = async (testResultData, maxRetries = 3) => {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[TestResult] Attempt ${attempt}/${maxRetries}: Tạo TestResult...`);
            
            // Import dynamic để tránh circular dependency
            const { testResultModel } = await import('~/models/testResult.model');
            
            // Tạo TestResult với status = PENDING
            const testResult = await testResultModel.createNew({
                ...testResultData,
                testResultStatus: TEST_RESULT_STATUS.PENDING,
                testResultRetryCount: attempt - 1,
            });
            
            console.log(`[TestResult] Thành công ở attempt ${attempt}: ${testResult._id}`);
            
            // Trả về: success, testResult, attempt mà thành
            return {
                success: true,
                testResult,
                attempt,
                error: null,
            };
        } catch (err) {
            lastError = err;
            console.warn(`[TestResult] Attempt ${attempt} thất bại: ${err.message}`);
            
            // Nếu chưa phải lần cuối cùng, chờ exponential backoff rồi retry
            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = Math.pow(2, attempt - 1) * 1000;
                console.log(`[TestResult] Chờ ${backoffMs}ms trước khi retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }
    
    // Sau khi thử ${maxRetries} lần vẫn fail
    console.error(`[TestResult] Tất cả ${maxRetries} attempts thất bại: ${lastError?.message}`);
    
    return {
        success: false,
        testResult: null,
        attempt: maxRetries,
        error: lastError?.message || 'Unknown error',
    };
};

/**
 * Service xử lý toàn bộ workflow EHR trên blockchain
 * Step 4: Patient xác nhận đồng ý (CONSENTED)
 * Step 5: Lab Tech tiếp nhận order (IN_PROGRESS)
 * Step 6: Lab Tech post kết quả (RESULT_POSTED)
 * Step 7: Bác sĩ thêm diễn giải lâm sàng (DOCTOR_REVIEWED)
 * Step 8: Bác sĩ chốt hồ sơ (COMPLETE)
 */

// Step 4: Patient xác nhận đồng ý
const consentToOrder = async (currentUser, labOrderId, txHash = null) => {
    // [Xác thực role = PATIENT (không chỉ tin middleware)
    await verifyRole(currentUser, 'PATIENT');

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // [Chuẩn hóa địa chỉ ví trước so sánh
    const normalizedPatientAddress = normalizeWalletAddress(labOrder.patientAddress);
    const normalizedUserWallet = normalizeWalletAddress(currentUser.walletAddress);

    // Kiểm tra bệnh nhân sở hữu order này
    if (normalizedPatientAddress !== normalizedUserWallet) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền xác nhận order này');
    }

    // Kiểm tra trạng thái hiện tại phải là ORDERED
    if (labOrder.sampleStatus !== 'ORDERED') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Chỉ có thể xác nhận order ở trạng thái ORDERED, hiện tại: ${labOrder.sampleStatus}`
        );
    }

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    if (!txHash) {
        const preparedTx = await metaMaskTxBuilder.prepareConsentTx(normalizedUserWallet, recordId);
        return buildPrepareResponse('CONSENT_LAB_ORDER', preparedTx, {
            labOrderId,
            recordId,
            fromStatus: 'ORDERED',
            toStatus: 'CONSENTED',
        });
    }

    await verifyConfirmedTxByUser(normalizedUserWallet, txHash);

    await verifyTxFunctionCall({
        txHash,
        contract: blockchainContracts.read.ehrManager,
        functionName: 'updateRecordStatus',
        argsValidator: (args) =>
            Number(args?.[0]) === Number(recordId) && Number(args?.[1]) === 1,
    });

    // Cập nhật trạng thái trong MongoDB
    // findOneAndUpdate thay vì labOrder.save() — atomic, tránh race condition
    const now = new Date();
    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        { _id: labOrderId, sampleStatus: 'ORDERED' },
        {
            $set: {
                sampleStatus: 'CONSENTED',
                txHash,
                // Lưu wallet đã được normalize
                patientWalletAddress: normalizedUserWallet,
            },
            $push: {
                auditLogs: {
                    from: 'ORDERED',
                    to: 'CONSENTED',
                    by: normalizedUserWallet,
                    at: now,
                    txHash,
                },
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Lab order đã bị thay đổi bởi request khác hoặc không còn ở trạng thái ORDERED'
        );
    }

    // Ghi audit log
    // Non-blocking — không để audit fail ảnh hưởng main flow
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedUserWallet,
            action: 'CONSENT_LAB_ORDER',
            entityType: 'LAB_ORDER',
            entityId: updatedOrder._id,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Patient consented to lab order ${labOrderId}`,
                recordId,
            },
        });
    } catch (auditError) {
        console.error(`[Consent Order] Audit log failed (non-blocking):`, auditError.message);
    }

    return {
        message: 'Xác nhận đồng ý thành công',
        orderId: updatedOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'CONSENTED',
        updatedAt: now,
    };
};

// Step 5: Lab Tech tiếp nhận order
const receiveOrder = async (currentUser, labOrderId, txHash = null) => {
    await verifyRole(currentUser, 'LAB_TECH');

    // FIX #1: Chỉ query 1 lần, xóa labOrderForReceive
    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    if (labOrder.sampleStatus !== 'CONSENTED') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Chỉ có thể tiếp nhận order ở trạng thái CONSENTED, hiện tại: ${labOrder.sampleStatus}`
        );
    }

    if (!labOrder.assignedLabTech || labOrder.assignedLabTech.toString() !== currentUser._id.toString()) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Order ${labOrderId} không được assign cho bạn. ` +
            `Chỉ lab tech được chỉ định bởi bác sĩ mới có thể tiếp nhận.`
        );
    }

    const normalizedLabTechWallet = normalizeWalletAddress(currentUser.walletAddress);

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    if (!txHash) {
        const preparedTx = await metaMaskTxBuilder.prepareReceiveOrderTx(normalizedLabTechWallet, recordId);
        return buildPrepareResponse('RECEIVE_LAB_ORDER', preparedTx, {
            labOrderId,
            recordId,
            fromStatus: 'CONSENTED',
            toStatus: 'IN_PROGRESS',
        });
    }

    await verifyConfirmedTxByUser(normalizedLabTechWallet, txHash);

    await verifyTxFunctionCall({
        txHash,
        contract: blockchainContracts.read.ehrManager,
        functionName: 'updateRecordStatus',
        argsValidator: (args) =>
            Number(args?.[0]) === Number(recordId) && Number(args?.[1]) === 2,
    });

    // FIX #2 + #3: findOneAndUpdate atomic, thêm txHash vào $set
    const now = new Date();
    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        { _id: labOrderId, sampleStatus: 'CONSENTED' },
        {
            $set: {
                sampleStatus: 'IN_PROGRESS',
                collectedAt: now,
                txHash, // FIX #3: lưu txHash lên top-level field
                labTechWalletAddress: normalizedLabTechWallet,
            },
            $push: {
                auditLogs: {
                    from: 'CONSENTED',
                    to: 'IN_PROGRESS',
                    by: normalizedLabTechWallet,
                    at: now,
                    txHash,
                },
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Lab order đã bị thay đổi bởi request khác hoặc không còn ở trạng thái CONSENTED'
        );
    }

    // FIX #4: Bọc try/catch — audit fail không được block response
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedLabTechWallet,
            action: 'RECEIVE_LAB_ORDER',
            entityType: 'LAB_ORDER',
            entityId: updatedOrder._id,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Lab tech received lab order ${labOrderId}`,
                recordId,
            },
        });
    } catch (auditError) {
        console.error(`[Receive Order] Audit log failed (non-blocking):`, auditError.message);
    }

    return {
        message: 'Tiếp nhận order thành công',
        orderId: updatedOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'IN_PROGRESS',
        updatedAt: now,
    };
};

// Step 6: Lab Tech post kết quả
const postLabResult = async (currentUser, labOrderId, resultData) => {
    // [Sửa #1] Xác thực role = LAB_TECH (không chỉ tin middleware)
    // [Sửa #2] Xác thực status = ACTIVE
    await verifyRole(currentUser, 'LAB_TECH');

    const { rawData, note, txHash: confirmedTxHash } = resultData;

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // Kiểm tra trạng thái phải là IN_PROGRESS
    if (labOrder.sampleStatus !== 'IN_PROGRESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể post kết quả khi order ở trạng thái IN_PROGRESS, hiện tại: ${labOrder.sampleStatus}`);
    }

    // [Vấn đề 3] Kiểm tra: lab tech hiện tại phải là người được assign + đã receive order
    if (!labOrder.assignedLabTech) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Order này chưa được assign. Hãy yêu cầu admin phân công order.`
        );
    }

    if (labOrder.assignedLabTech.toString() !== currentUser._id.toString()) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Order này được assign cho lab tech khác. Bạn chỉ có thể post kết quả cho orders được phân công cho mình.`
        );
    }

    // Normalize wallet address
    const normalizedLabTechWallet = normalizeWalletAddress(currentUser.walletAddress);

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    // SNAPSHOT: Chụp lại ví lab tech tại thời điểm gửi (vęt kiểm toàn bổ không thay đổi)
    // GHI CHÚC: txHash (on-chain msg.sender) là nguồn sự thật
    //      Snapshot là cho các truy vấn off-chain & indexắp audit log
    const labTechWalletSnapshot = normalizedLabTechWallet;

    // 1. Prepare result metadata for storage
    const labResultMetadata = {
        rawData,
        note,
        labTech: normalizedLabTechWallet,
        postedAt: new Date().toISOString(),
    };

    // [MEDIUM FIX #6] Simplified: metadata stored in MongoDB
    // MongoDB-only approach - no IPFS/Storacha
    console.log(`[Lab Result] Storing result metadata to MongoDB for order: ${recordId}`);

    // 2. Tính labResultHash = keccak256(kết quả)
    const labResultString = JSON.stringify(labResultMetadata);
    const labResultHash = ethers.keccak256(ethers.toUtf8Bytes(labResultString));

    // 3. Gọi postLabResult trên EHRManager (v4 optimization - labResultIpfsHash stored off-chain)
    let txHash = confirmedTxHash;
    let syncBlockNumber = null;
    if (!txHash) {
        const preparedTx = await metaMaskTxBuilder.preparePostResultTx(normalizedLabTechWallet, recordId, labResultHash);
        return buildPrepareResponse('POST_LAB_RESULT', preparedTx, {
            labOrderId,
            recordId,
            labResultHash,
            fromStatus: 'IN_PROGRESS',
            toStatus: 'RESULT_POSTED',
        });
    }

    try {
        const verification = await verifyConfirmedTxByUser(normalizedLabTechWallet, txHash);
        syncBlockNumber = verification.blockNumber;

        await verifyTxFunctionCall({
            txHash,
            contract: blockchainContracts.read.ehrManager,
            functionName: 'postLabResult',
            argsValidator: (args) => Number(args?.[0]) === Number(recordId) && args?.[1]?.toLowerCase() === labResultHash.toLowerCase(),
        });
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain postLabResult thất bại: ${blockchainError.message}`);
    }

    // 4. Cập nhật trạng thái trong MongoDB trước audit log, dùng findOneAndUpdate để atomic + tránh race condition
    const now = new Date();
    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        { _id: labOrderId, sampleStatus: 'IN_PROGRESS' },
        {
            $set: {
                sampleStatus: 'RESULT_POSTED',
                labResultHash,
                labResultData: rawData,
                labResultNote: note,
                processingAt: now,
                labTechWalletAddress: normalizedLabTechWallet,
                txHash: confirmedTxHash,
            },
            $push: {
                auditLogs: {
                    from: 'IN_PROGRESS',
                    to: 'RESULT_POSTED',
                    by: normalizedLabTechWallet,
                    at: now,
                    txHash: confirmedTxHash,
                },
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Lab order đã bị thay đổi bởi request khác hoặc không còn ở trạng thái IN_PROGRESS'
        );
    }


    // Ghi audit log trực tiếp với txHash (blockchain là authority)
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedLabTechWallet,
            action: 'POST_LAB_RESULT',
            entityType: 'LAB_ORDER',
            entityId: labOrder._id,
            txHash,
            blockNumber: syncBlockNumber,
            status: 'SUCCESS',
            details: {
                note: `Lab tech posted result (blockchain confirmed)`,
                recordId,
                labResultHash,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (auditError) {
        console.error(`[Lab Result] Audit log failed (non-blocking):`, auditError.message);
    }

    // // 4. Cập nhật trạng thái trong MongoDB
    // const now = new Date();
    // labOrder.sampleStatus = 'RESULT_POSTED';
    // labOrder.labResultHash = labResultHash;
    // labOrder.labResultData = rawData;
    // labOrder.labResultNote = note;
    // labOrder.processingAt = now;
    // // SNAPSHOT: Store lab tech wallet snapshot for query optimization
    // labOrder.labTechWalletAddress = labTechWalletSnapshot;
    // // PROOF: Store tx hash (source of truth)
    // labOrder.txHash = txHash;
    // labOrder.auditLogs.push({
    //     from: 'IN_PROGRESS',
    //     to: 'RESULT_POSTED',
    //     by: normalizedLabTechWallet,
    //     at: now,
    //     txHash,
    // });
    // await labOrder.save();

    // STEP: Cập nhật trạng thái Hồ sơ Y tế = HAS_RESULT
    // ════════════════════════════════════════════════════════════════════════════════
    if (updatedOrder.relatedMedicalRecordId) {
        try {
            await medicalRecordService.updateStatus(updatedOrder.relatedMedicalRecordId, 'HAS_RESULT');
        } catch (recordError) {
            console.warn(`[Lab Result] Medical Record update failed (non-blocking):`, recordError.message);
        }
    }

    // STEP: Tạo Kết quả Xét nghiệm (lớp phân tích AI)
    // ════════════════════════════════════════════════════════════════════════════════
    // [Issue B] Thêm retry logic + track testResultStatus
    // - Non-blocking: main flow tiếp tục dù TestResult fail
    // - Resilient: retry 3 lần nếu FastAPI timeout
    // - Transparent: client biết exact status + retry count
    
    let testResultStatus = TEST_RESULT_STATUS.FAILED;  // Assume fail, fill success nếu ok
    let testResultRetryCount = 0;
    let testResultError = null;

    try {
        console.log(`[Lab Result] Bước: Tạo kết quả xét nghiệm để phân tích AI...`);

        // Gọi FastAPI để lấy AI analysis (NẾU là DIABETES_TEST)
        let aiAnalysis = {};
        if (labOrder.recordType === 'DIABETES_TEST') {
            try {
                // Lấy tuổi bệnh nhân để gửi cho AI
                const { patientModel } = await import('~/models/patient.model');
                const patient = await patientModel.findById(labOrder.patientId);
                const age = patient ? new Date().getFullYear() - patient.birthYear : 0;

                console.log(`[Lab Result] Gọi FastAPI: ${AI_SERVICE_URL}`);

                // Gửi request để AI phân tích
                const aiResponse = await fetch(AI_SERVICE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        Pregnancies: rawData.pregnancies,
                        Glucose: rawData.glucose,
                        BloodPressure: rawData.bloodPressure,
                        SkinThickness: rawData.skinThickness,
                        Insulin: rawData.insulin,
                        BMI: rawData.bmi,
                        DiabetesPedigreeFunction: rawData.diabetesPedigreeFunction,
                        Age: age,
                    }),
                });

                if (aiResponse.ok) {
                    const d = await aiResponse.json();
                    aiAnalysis = {
                        diabetes: d.diabetes === 1,
                        probability: Math.round(d.probability * 100),
                        risk: d.risk,
                        aiNote: d.note,
                    };
                    console.log(`[Lab Result] AI phân tích xong:`, aiAnalysis);
                } else {
                    console.warn(`[Lab Result] AI service trả về status: ${aiResponse.status}`);
                }
            } catch (aiError) {
                // Non-blocking: AI fail không ảnh hưởng main flow
                console.warn(`[Lab Result] Gọi AI thất bại (non-blocking): ${aiError.message}`);
            }
        }

        // [Issue B] Tạo TestResult với retry logic
        // - Nếu success: testResultStatus = SUCCESS, testResultId được set
        // - Nếu fail sau 3 retries: testResultStatus = FAILED, testResultId = null
        const retryResult = await createTestResultWithRetry({
            labOrderId: labOrder._id,
            medicalRecordId: labOrder.relatedMedicalRecordId,
            patientId: labOrder.patientId,
            createdBy: currentUser._id,
            testType: labOrder.recordType,
            aiAnalysis,  // Chỉ gửi AI analysis, không gửi rawData (bảo mật)
        }, 3);  // Retry tối đa 3 lần

        if (retryResult.success) {
            testResultStatus = TEST_RESULT_STATUS.SUCCESS;
            testResultRetryCount = retryResult.attempt - 1;

            // FIX #4: Save testResultId riêng bằng $set, không đụng các field khác
            await labOrderModel.LabOrderModel.findByIdAndUpdate(updatedOrder._id, {
                $set: {
                    testResultId: retryResult.testResult._id,
                    testResultStatus: TEST_RESULT_STATUS.SUCCESS,
                },
            });
        } 
        // Update DB trực tiếp để ghi nhận TestResult FAILED, tránh race condition và không ghi đè dữ liệu khác
        else {
            testResultStatus = TEST_RESULT_STATUS.FAILED;
            testResultRetryCount = retryResult.attempt;
            testResultError = retryResult.error;

            await labOrderModel.LabOrderModel.findByIdAndUpdate(updatedOrder._id, {
                $set: {
                    testResultId: null,
                    testResultStatus: TEST_RESULT_STATUS.FAILED,
                    testResultError: retryResult.error,
                },
            });
        }

        // // Lưu trạng thái TestResult vào LabOrder
        // await labOrder.save();

    } 
    catch (unexpectedError) {
        console.error(`[Lab Result] Lỗi bất ngờ khi tạo TestResult:`, unexpectedError.message);
        testResultStatus = TEST_RESULT_STATUS.FAILED;
        testResultError = unexpectedError.message; // ← giờ update đúng variable ngoài

        await labOrderModel.LabOrderModel.findByIdAndUpdate(updatedOrder._id, {
            $set: {
                testResultStatus: TEST_RESULT_STATUS.FAILED,
                testResultError: unexpectedError.message,
            },
        });
    }

    // 5. Ghi audit log
    // await auditLogModel.createLog({
    //     userId: currentUser._id,
    //     walletAddress: normalizedLabTechWallet,
    //     action: 'POST_LAB_RESULT',
    //     entityType: 'LAB_ORDER',
    //     entityId: labOrder._id,
    //     txHash,
    //     status: 'SUCCESS',
    //     details: {
    //         note: `Lab tech post kết quả cho lab order ${labOrderId}`,
    //         recordId,
    //         labResultHash,
    //     },
    // });

    // [Issue B] Trả về response với testResultStatus + retry info
    // Client sẽ biết:
    // - testResultStatus: SUCCESS/FAILED (PENDING nếu still processing)
    // - testResultRetryCount: Bao nhiêu lần đã retry
    // - testResultError: Error message nếu fail (để debug)
    return {
        message: 'Post kết quả thành công',
        orderId: labOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'RESULT_POSTED',
        labResultHash,
        updatedAt: now,
        // [Issue B] New fields - TestResult status tracking
        testResultId: labOrder.testResultId?.toString() || null,
        testResultStatus: testResultStatus,          // SUCCESS / FAILED
        testResultRetryCount: testResultRetryCount,  // Số lần đã retry
        testResultError: testResultError,            // Error message nếu fail (null nếu success)
    };
};

// Step 7: Bác sĩ thêm diễn giải lâm sàng
// ============================================================================
// HELPER FUNCTIONS: Clear, focused validation with specific error messages
// ============================================================================

/**
 * Helper 1: Verify Doctor Role
 * Kiểm tra: currentUser có role = DOCTOR?
 * Error message: Cụ thể nếu không phải doctor
 */
const verifyDoctorRoleHelper = async (currentUser) => {
    try {
        await verifyRole(currentUser, 'DOCTOR');
    } catch (err) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Chỉ bác sĩ (DOCTOR) mới có thể thêm diễn giải lâm sàng. ` +
            `Bạn hiện tại có role: ${currentUser.role || 'UNKNOWN'}. ` +
            `Hãy liên hệ admin để cấp role DOCTOR.`
        );
    }
};

/**
 * Helper 2: Verify Blockchain Doctor Registration
 * Kiểm tra: Wallet có được đăng ký làm DOCTOR trên blockchain?
 * Error message: Cụ thể wallet nào, cách fix
 */
const verifyBlockchainDoctorHelper = async (walletAddress) => {
    const normalizedAddr = walletAddress.toLowerCase();
    try {
        const isDoctorOnChain = await blockchainContracts.read.accountManager.isDoctor(normalizedAddr);
        if (!isDoctorOnChain) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Wallet ${normalizedAddr} chưa được đăng ký làm DOCTOR trên blockchain.\\n` +
                `Cách fix:\\n` +
                `1. Yêu cầu admin đăng ký wallet này trên blockchain\\n` +
                `2. Hoặc dùng wallet khác đã được đăng ký\\n` +
                `3. Sau đó logout → login lại`
            );
        }
        console.log(`[Clinical Interpretation] Verified: Doctor ${normalizedAddr} is registered on blockchain`);
    } catch (err) {
        if (err.statusCode) throw err;
        throw new ApiError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Không thể kiểm tra blockchain registration: ${err.message}`
        );
    }
};

/**
 * Helper 3: Verify Patient Access Grant
 * Kiểm tra: Doctor có quyền truy cập bệnh nhân này với level yêu cầu?
 * Error message: Cụ thể level hiện tại vs cần thiết, cách fix
 */
const verifyPatientAccessHelper = async (patientAddr, doctorAddr, requiredLevel) => {
    const levelsMap = { 0: 'NONE', 1: 'EMERGENCY', 2: 'FULL', 3: 'SENSITIVE' };
    try {
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientAddr,
            doctorAddr,
            requiredLevel
        );
        if (!hasAccess) {
            // Fetch current grant to show what level doctor has
            let currentLevel = 0;
            try {
                const grant = await blockchainContracts.read.accessControl.getAccessGrant(
                    patientAddr,
                    doctorAddr
                );
                currentLevel = grant.level || 0;
            } catch (e) {
                console.warn('Could not fetch current access level');
            }
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Bác sĩ ${doctorAddr} không có quyền truy cập đủ cho bệnh nhân ${patientAddr}.\\n` +
                `Cấp độ hiện tại: ${levelsMap[currentLevel] || 'UNKNOWN'}\\n` +
                `Cần tối thiểu: ${levelsMap[requiredLevel] || 'UNKNOWN'}\\n` +
                `Cách fix:\\n` +
                `1. Yêu cầu bệnh nhân cấp quyền truy cập qua mobile app\\n` +
                `2. Hoặc admin có thể cấp quyền khẩn cấp\\n` +
                `3. Chờ 1-2 phút rồi thử lại`
            );
        }
        console.log(`[Clinical Interpretation] Verified: Access level ${levelsMap[requiredLevel]} granted for patient`);
    } catch (err) {
        if (err.statusCode) throw err;
        throw new ApiError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Không thể kiểm tra quyền truy cập: ${err.message}`
        );
    }
};

// ============================================================================
// MAIN FUNCTION: Clean, step-by-step flow
// ============================================================================

const addClinicalInterpretation = async (currentUser, labOrderId, interpretationData) => {
    console.log(`[Clinical Interpretation] Starting: labOrderId=${labOrderId}, doctor=${currentUser.walletAddress}`);

    // Step 0: Validate input
    const { interpretation, recommendation, confirmedDiagnosis, interpreterNote, txHash: confirmedTxHash } = interpretationData;
    if (!confirmedDiagnosis || !interpretation) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Field "confirmedDiagnosis" và "interpretation" đều bắt buộc. ` +
            `Bác sĩ phải xác nhận chẩn đoán và nhập diễn giải lâm sàng sau khi review kết quả lab. ` +
            `(Frontend nên pre-fill confirmedDiagnosis từ medical record.diagnosis)`
        );
    }

    // Step 1: Verify doctor role
    console.log(`[Clinical Interpretation] Step 1: Verifying doctor role...`);
    await verifyDoctorRoleHelper(currentUser);

    // Step 2: Verify blockchain registration
    const normalizedDoctorAddr = normalizeWalletAddress(currentUser.walletAddress);
    console.log(`[Clinical Interpretation] Step 2: Verifying blockchain registration...`);
    await verifyBlockchainDoctorHelper(normalizedDoctorAddr);

    // Step 3: Load lab order
    console.log(`[Clinical Interpretation] Step 3: Loading lab order...`);
    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, `Lab order không tồn tại: ${labOrderId}`);
    }

    // Step 4: Verify lab order status = RESULT_POSTED
    if (labOrder.sampleStatus !== 'RESULT_POSTED') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Chỉ có thể thêm diễn giải khi lab result đã được post.\\n` +
            `Status hiện tại: ${labOrder.sampleStatus}\\n` +
            `Vui lòng chờ kỹ thuật viên post kết quả.`
        );
    }

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lab order không có blockchainRecordId`);
    }

    // Auto-fix missing requiredLevel for old orders
    if (!labOrder.requiredLevel) {
        const calculatedLevel = labOrder.recordType === 'HIV_TEST' ? 3 : 2;
        labOrder.requiredLevel = calculatedLevel;
        await labOrder.save({ validateBeforeSave: false });
        console.log(`[Clinical Interpretation] Auto-fixed missing requiredLevel: ${calculatedLevel}`);
    }

    // Step 5: Verify patient access grant
    const normalizedPatientAddr = labOrder.patientAddress.toLowerCase();
    const requiredLevelForCheck = labOrder.requiredLevel || 2;
    console.log(`[Clinical Interpretation] Step 5: Verifying patient access (level ${requiredLevelForCheck})...`);
    await verifyPatientAccessHelper(normalizedPatientAddr, normalizedDoctorAddr, requiredLevelForCheck);

    // Step 6: Calculate interpretation hash
    const interpretationHash = ethers.keccak256(
        ethers.toUtf8Bytes(interpretation + (recommendation || ''))
    );
    console.log(`[Clinical Interpretation] Step 6: Calculated interpretationHash: ${interpretationHash}`);

    if (!confirmedTxHash) {
        const preparedTx = await metaMaskTxBuilder.prepareInterpretationTx(normalizedDoctorAddr, recordId, interpretationHash);
        return buildPrepareResponse('ADD_CLINICAL_INTERPRETATION', preparedTx, {
            labOrderId,
            recordId,
            interpretationHash,
            confirmedDiagnosis,
            fromStatus: 'RESULT_POSTED',
            toStatus: 'DOCTOR_REVIEWED',
        });
    }

    // Step 7: Verify transaction confirmed by doctor wallet
    console.log(`[Clinical Interpretation] Step 7: Verifying signed transaction...`);
    let txHash = confirmedTxHash;
    let syncBlockNumber = null;
    const verification = await verifyConfirmedTxByUser(normalizedDoctorAddr, confirmedTxHash);
    syncBlockNumber = verification.blockNumber;

    await verifyTxFunctionCall({
        txHash: confirmedTxHash,
        contract: blockchainContracts.read.ehrManager,
        functionName: 'addClinicalInterpretation',
        argsValidator: (args) => Number(args?.[0]) === Number(recordId) && args?.[1]?.toLowerCase() === interpretationHash.toLowerCase(),
    });

    // Step 8: Update MongoDB
    console.log(`[Clinical Interpretation] Step 8: Updating MongoDB...`);
    const now = new Date();
    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        { _id: labOrderId, sampleStatus: 'RESULT_POSTED' },
        {
            $set: {
                sampleStatus: 'DOCTOR_REVIEWED',
                interpretationHash,
                clinicalInterpretation: interpretation,
                recommendation,
                interpreterNote,
                doctorId: currentUser._id?.toString(),
                doctorWalletAddress: normalizedDoctorAddr,
                txHash: confirmedTxHash,
            },
            $push: {
                auditLogs: {
                    from: 'RESULT_POSTED',
                    to: 'DOCTOR_REVIEWED',
                    by: normalizedDoctorAddr,
                    at: now,
                    txHash: confirmedTxHash,
                },
            },
        },
        { new: true }
    );
    // Nếu lab-order bị thay đổi throw lỗi
    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Lab order đã bị thay đổi bởi request khác hoặc không còn ở trạng thái RESULT_POSTED'
        );
    }

    console.log(`[Clinical Interpretation] MongoDB status updated to DOCTOR_REVIEWED`);

    // try {
    //     await labOrder.save();
    //     console.log(`[Clinical Interpretation] MongoDB status updated to DOCTOR_REVIEWED`);
    // } catch (saveError) {
    //     throw new ApiError(
    //         StatusCodes.INTERNAL_SERVER_ERROR,
    //         `CRITICAL: Failed to save to database: ${saveError.message}`
    //     );
    // }

    // Step 9: Create audit log
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedDoctorAddr,
            action: 'ADD_CLINICAL_INTERPRETATION',
            entityType: 'LAB_ORDER',
            entityId: labOrder._id,
            txHash,
            blockNumber: syncBlockNumber,
            status: 'SUCCESS',
            details: {
                note: `Doctor added clinical interpretation (blockchain confirmed)`,
                recordId,
                interpretationHash,
                confirmedDiagnosis,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (auditError) {
        console.error(`[Clinical Interpretation] Audit log failed (non-blocking):`, auditError.message);
    }

    // Step 10: Auto-sync medical record with confirmed diagnosis
    let syncStatus = 'PENDING';
        if (updatedOrder.relatedMedicalRecordId) {
            try {
                const { medicalRecordService } = require('./medicalRecord.service');
                await medicalRecordService.syncConfirmedDiagnosisFromInterpretation(
                    updatedOrder.relatedMedicalRecordId,
                    {
                        confirmedDiagnosis,
                        interpretationHash,
                        doctorId: currentUser._id,
                    }
                );
                syncStatus = 'COMPLETED';
                console.log('Medical record diagnosis synced successfully');
            } 
            catch (syncErr) {
                console.error('Sync to medical record FAILED:', syncErr.message);
                console.error('Will retry later - main flow remains valid');
                syncStatus = 'FAILED_RETRY_LATER';
            }
    }


    return {
        message: 'Thêm diễn giải lâm sàng thành công',
        orderId: updatedOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'DOCTOR_REVIEWED',
        interpretationHash,
        confirmedDiagnosis,
        syncStatus,
        updatedAt: now,
    };
};

// Step 8: Bác sĩ chốt hồ sơ
/**
 * AFTER-COMPLETE ACCESS CONTROL ARCHITECTURE
 * ================================================
 * 
 * DECISION: Keep doctor access ACTIVE (no revoke)
 * 
 * RATIONALE:
 * Audit trail visibility: Doctor can view completed records for legal compliance
 * Follow-up care: Doctor may need to reference patient's diagnoses later
 * Medical continuity: Next encounter starts from COMPLETE record
 * Full revoke: Would break audit trail (lose access to proof)
 * 
 * SECURITY STRATEGY:
 * - Record.status = COMPLETE indicates "read-only" in UI
 * - Frontend enforces: No edit buttons when status = COMPLETE
 * - Backend logic: POST/PUT operations reject COMPLETE records (validation layer)
 * - Blockchain: Access level unchanged (still FULL, but immutable in UI)
 * 
 * WORKFLOW STATES:
 * CREATED
 *   ↓
 * WAITING_RESULT (has lab order)
 *   ↓
 * HAS_RESULT (lab posted result)
 *   ↓
 * DIAGNOSED (doctor reviewed)
 *   ↓
 * COMPLETE (doctor finalized)
 *   ↓
 * [ARCHIVED or NEXT VISIT] (create new record for follow-up)
 * 
 * FUTURE ENHANCEMENT (if needed):
 * Option A: Automatic read-only lock
 *   → When status = COMPLETE, set accessLevel = 1 (READ_ONLY) on blockchain
 *   → Doctor can view but queryFilter fails for modifications
 * 
 * Option B: Manual freeze endpoint
 *   → POST /medical-records/:id/freeze
 *   → Admin-only, revokes all access except audit logs
 * 
 * Option C: Time-based expiry
 *   → Set expiresAt = completedAt + 30 days
 *   → After expiry, access automatically revoked (for privacy)
 * 
 * Currently: Option 0 (No action) - status flag only, UI enforces read-only
 */
const completeRecord = async (currentUser, labOrderId, txHash = null) => {
    // [HIGH FIX #1] Verify role = DOCTOR (using helper for consistency)
    // [HIGH FIX #2] Verify status = ACTIVE (using helper)
    await verifyRole(currentUser, 'DOCTOR');

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // Kiểm tra trạng thái phải là DOCTOR_REVIEWED
    if (labOrder.sampleStatus !== 'DOCTOR_REVIEWED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể chốt hồ sơ khi order ở trạng thái DOCTOR_REVIEWED, hiện tại: ${labOrder.sampleStatus}`);
    }

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    // // [MEDIUM FIX #1] Pre-validate status before blockchain call
    // const labOrderForComplete = await labOrderModel.LabOrderModel.findById(labOrderId);
    // if (labOrderForComplete && labOrderForComplete.sampleStatus !== 'DOCTOR_REVIEWED') {
    //     throw new ApiError(StatusCodes.BAD_REQUEST, `Expected status DOCTOR_REVIEWED but found ${labOrderForComplete.sampleStatus}. Cannot finalize record`);
    // }

    const normalizedDoctorWallet = normalizeWalletAddress(currentUser.walletAddress);

    if (!txHash) {
        const preparedTx = await metaMaskTxBuilder.prepareCompleteTx(normalizedDoctorWallet, recordId);
        return buildPrepareResponse('COMPLETE_RECORD', preparedTx, {
            labOrderId,
            recordId,
            fromStatus: 'DOCTOR_REVIEWED',
            toStatus: 'COMPLETE',
        });
    }

    await verifyConfirmedTxByUser(normalizedDoctorWallet, txHash);

    await verifyTxFunctionCall({
        txHash,
        contract: blockchainContracts.read.ehrManager,
        functionName: 'updateRecordStatus',
        argsValidator: (args) => Number(args?.[0]) === Number(recordId) && Number(args?.[1]) === 5,
    });

    // Cập nhật trạng thái trong MongoDB
    const now = new Date();
    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        { _id: labOrderId, sampleStatus: 'DOCTOR_REVIEWED' },
        {
            $set: {
                sampleStatus: 'COMPLETE',
                completedAt: now,
                txHash, // FIX #3: Lưu txHash lên top-level field
                doctorWalletAddress: normalizedDoctorWallet,
            },
            $push: {
                auditLogs: {
                    from: 'DOCTOR_REVIEWED',
                    to: 'COMPLETE',
                    by: normalizedDoctorWallet,
                    at: now,
                    txHash,
                },
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Lab order đã bị thay đổi bởi request khác hoặc không còn ở trạng thái DOCTOR_REVIEWED'
        );
    }

    // Sync Medical Record
    if (updatedOrder.relatedMedicalRecordId) {
        try {
            await medicalRecordService.updateStatus(updatedOrder.relatedMedicalRecordId, 'COMPLETE');
        } catch (syncErr) {
            console.error(`[STATE SYNC] Failed to update medical record: ${syncErr.message}`);
        }
    }

    // Bọc auditLog trong try/catch — không được block main flow
     try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedDoctorWallet,
            action: 'COMPLETE_RECORD',
            entityType: 'LAB_ORDER',
            entityId: updatedOrder._id,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Doctor completed lab order ${labOrderId}`,
                recordId,
            },
        });
    } 
    catch (auditError) {
        console.error(`[Complete Record] Audit log failed (non-blocking):`, auditError.message);
    }

    return {
        message: 'Chốt hồ sơ thành công',
        orderId: updatedOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'COMPLETE',
        updatedAt: now,
    };
};

// [DIRECT COMPLETE - NO LAB ORDER] Bác sĩ hoàn thành hồ sơ (không có xét nghiệm)
// Trường hợp: Bệnh nhân đến khám, bác sĩ chẩn đoán lâm sàng đủ → không cần xét nghiệm
// Ví dụ: Viêm họng cấp, cảm cúm - có thể complete mà không lab order
// Điều kiện: Hồ sơ PHẢI có diagnosis hoặc confirmedDiagnosis
const directCompleteRecord = async (currentUser, medicalRecordId) => {
    // [HIGH FIX #2] Kiểm tra role = DOCTOR
    await verifyRole(currentUser, 'DOCTOR');

    // 1. Lấy hồ sơ bệnh án từ MongoDB
    const medicalRecord = await medicalRecordModel.MedicalRecordModel.findById(medicalRecordId);
    if (!medicalRecord) {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            `Hồ sơ bệnh án (ID: ${medicalRecordId}) không tồn tại`
        );
    }

    // [Sửa #3] Trạng thái phải là CREATED (không lab) hoặc DIAGNOSED (lab đã review)
    // Chặn: WAITING_RESULT (lab đang chờ), HAS_RESULT (dữ liệu lab đã nhận), COMPLETE (đã xong)
    const validStatesForDirectComplete = ['CREATED', 'DIAGNOSED'];
    if (!validStatesForDirectComplete.includes(medicalRecord.status)) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Không thể hoàn thành trực tiếp từ trạng thái: ${medicalRecord.status}. ` +
            `Chỉ tạo được từ: CREATED (không lab) hoặc DIAGNOSED (đã review lab results). ` +
            `Nếu đang chờ lab results, phải hoàn thành qua lab order completion.`
        );
    }

    // 2. XÁC THựC: Hồ sơ PHẢI có chẩn đoán + KHÔNG có lab order liên quan
    const hasLabOrders = medicalRecord.relatedLabOrderIds && medicalRecord.relatedLabOrderIds.length > 0;
    const hasDiagnosis = medicalRecord.diagnosis || medicalRecord.confirmedDiagnosis;

    if (!hasDiagnosis) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Không thể hoàn thành hồ sơ mà không có chẩn đoán. ' +
            'Vui lòng nhập chẩn đoán ban đầu trước khi hoàn thành.'
        );
    }

    if (hasLabOrders) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Hồ sơ này có lab order liên quan. ' +
            'Phải hoàn thành workflow qua lab order (COMPLETE qua lab order completion).'
        );
    }

    // [Sửa #3] Chuẩn hóa địa chỉ ví bác sĩ
    const normalizedDoctorWallet = normalizeWalletAddress(currentUser.walletAddress);

    // 4. Cập nhật trạng thái → COMPLETE
    // [Sửa tập trung] Sử dụng medicalRecordService.updateStatus() để đảm bảo xác thực nhất quán
    const now = new Date();
    try {
        const updatedRecord = await medicalRecordService.updateStatus(medicalRecordId, 'COMPLETE');
        console.log(`[DIRECT COMPLETE] Hồ sơ bệnh án ${medicalRecordId} → COMPLETE (không lab order)`);
    } catch (updateError) {
        throw new ApiError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Lỗi cập nhật hồ sơ: ${updateError.message}`
        );
    }

    // 5. Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedDoctorWallet,
        action: 'COMPLETE_MEDICAL_RECORD_DIRECT',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecord._id,
        status: 'SUCCESS',
        details: {
            note: `Bác sĩ hoàn thành hồ sơ bệnh án không có lab order (chẩn đoán lâm sàng)`,
            medicalRecordId,
            diagnosis: medicalRecord.diagnosis || medicalRecord.confirmedDiagnosis,
            flowType: 'DIRECT_COMPLETE_NO_LAB_ORDER',
            timestamp: now.toISOString(),
        },
    });

    // Trả về kết quả
    return {
        message: 'Hoàn thành hồ sơ bệnh án thành công (không có xét nghiệm)',
        medicalRecordId: medicalRecord._id.toString(),
        status: 'COMPLETE',
        diagnosis: medicalRecord.diagnosis || medicalRecord.confirmedDiagnosis,
        completedAt: now,
        flowType: 'DIRECT_COMPLETE_NO_LAB_ORDER',
    };
};

const prepareConsentToOrder = async (currentUser, labOrderId) => {
    return consentToOrder(currentUser, labOrderId, null);
};

const confirmConsentToOrder = async (currentUser, labOrderId, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận đồng ý xét nghiệm');
    }
    return consentToOrder(currentUser, labOrderId, txHash);
};

const prepareReceiveOrder = async (currentUser, labOrderId) => {
    return receiveOrder(currentUser, labOrderId, null);
};

const confirmReceiveOrder = async (currentUser, labOrderId, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận tiếp nhận order');
    }
    return receiveOrder(currentUser, labOrderId, txHash);
};

const preparePostLabResult = async (currentUser, labOrderId, resultData) => {
    const payload = { ...(resultData || {}) };
    delete payload.txHash;
    return postLabResult(currentUser, labOrderId, payload);
};

const confirmPostLabResult = async (currentUser, labOrderId, resultData) => {
    if (!resultData?.txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận post kết quả');
    }
    return postLabResult(currentUser, labOrderId, resultData);
};

const prepareClinicalInterpretation = async (currentUser, labOrderId, interpretationData) => {
    const payload = { ...(interpretationData || {}) };
    delete payload.txHash;
    return addClinicalInterpretation(currentUser, labOrderId, payload);
};

const confirmClinicalInterpretation = async (currentUser, labOrderId, interpretationData) => {
    if (!interpretationData?.txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận thêm diễn giải lâm sàng');
    }
    return addClinicalInterpretation(currentUser, labOrderId, interpretationData);
};

const prepareCompleteRecord = async (currentUser, labOrderId) => {
    return completeRecord(currentUser, labOrderId, null);
};

const confirmCompleteRecord = async (currentUser, labOrderId, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận chốt hồ sơ');
    }
    return completeRecord(currentUser, labOrderId, txHash);
};

export const ehrWorkflowService = {
    prepareConsentToOrder,
    confirmConsentToOrder,
    prepareReceiveOrder,
    confirmReceiveOrder,
    preparePostLabResult,
    confirmPostLabResult,
    prepareClinicalInterpretation,
    confirmClinicalInterpretation,
    prepareCompleteRecord,
    confirmCompleteRecord,
    directCompleteRecord,
};

