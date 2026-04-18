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

/**
 * Service xử lý toàn bộ workflow EHR trên blockchain
 * Step 4: Patient xác nhận đồng ý (CONSENTED)
 * Step 5: Lab Tech tiếp nhận order (IN_PROGRESS)
 * Step 6: Lab Tech post kết quả (RESULT_POSTED)
 * Step 7: Bác sĩ thêm diễn giải lâm sàng (DOCTOR_REVIEWED)
 * Step 8: Bác sĩ chốt hồ sơ (COMPLETE)
 */

// Step 4: Patient xác nhận đồng ý
const consentToOrder = async (currentUser, labOrderId) => {
    // [Sửa #1] Xác thực role = PATIENT (không chỉ tin middleware)
    // [Sửa #2] Xác thực status = ACTIVE
    await verifyRole(currentUser, 'PATIENT');

    // Tìm lab order trong MongoDB
    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // [Sửa #3] Chuẩn hóa địa chỉ ví trước so sánh
    const normalizedPatientAddress = normalizeWalletAddress(labOrder.patientAddress);
    const normalizedUserWallet = normalizeWalletAddress(currentUser.walletAddress);

    // Kiểm tra bệnh nhân sở hữu order này
    if (normalizedPatientAddress !== normalizedUserWallet) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền xác nhận order này');
    }

    // Kiểm tra trạng thái hiện tại phải là ORDERED
    if (labOrder.sampleStatus !== 'ORDERED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể xác nhận order ở trạng thái ORDERED, hiện tại: ${labOrder.sampleStatus}`);
    }

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    // [Sửa #1] Kiểm tra role trước gọi blockchain
    const labOrderForStatus = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (labOrderForStatus && labOrderForStatus.sampleStatus !== 'ORDERED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Expected status ORDERED but found ${labOrderForStatus.sampleStatus}. Cannot consent to lab order`);
    }

    // Gọi updateRecordStatus trên EHRManager: ORDERED → CONSENTED
    let txHash = null;
    try {
        const tx = await blockchainContracts.patient.ehrManager.updateRecordStatus(recordId, 1); // CONSENTED = 1
        const receipt = await tx.wait();
        txHash = receipt.hash;
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain updateRecordStatus thất bại: ${blockchainError.message}`);
    }

    // Cập nhật trạng thái trong MongoDB
    const now = new Date();
    labOrder.sampleStatus = 'CONSENTED';
    labOrder.auditLogs.push({
        from: 'ORDERED',
        to: 'CONSENTED',
        by: normalizedUserWallet,
        at: now,
        txHash,
    });
    await labOrder.save();

    // Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedUserWallet,
        action: 'CONSENT_LAB_ORDER',
        entityType: 'LAB_ORDER',
        entityId: labOrder._id,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Patient consented to lab order ${labOrderId}`,
            recordId,
        },
    });

    return {
        message: 'Xác nhận đồng ý thành công',
        orderId: labOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'CONSENTED',
        updatedAt: now,
    };
};

// Step 5: Lab Tech tiếp nhận order
const receiveOrder = async (currentUser, labOrderId) => {
    // [Sửa #1] Xác thực role = LAB_TECH (không chỉ tin middleware)
    // [Sửa #2] Xác thực status = ACTIVE
    await verifyRole(currentUser, 'LAB_TECH');

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // Kiểm tra trạng thái phải là CONSENTED
    if (labOrder.sampleStatus !== 'CONSENTED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể tiếp nhận order ở trạng thái CONSENTED, hiện tại: ${labOrder.sampleStatus}`);
    }

    // ✅ [HIGH FIX #3] Normalize wallet address
    const normalizedLabTechWallet = normalizeWalletAddress(currentUser.walletAddress);

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    // [Sửa #1] Kiểm tra trạng thái trước gọi blockchain
    const labOrderForReceive = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (labOrderForReceive && labOrderForReceive.sampleStatus !== 'CONSENTED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Expected status CONSENTED but found ${labOrderForReceive.sampleStatus}. Cannot receive lab order`);
    }

    // Gọi updateRecordStatus trên EHRManager: CONSENTED → IN_PROGRESS
    let txHash = null;
    try {
        const tx = await blockchainContracts.labTech.ehrManager.updateRecordStatus(recordId, 2); // IN_PROGRESS = 2
        const receipt = await tx.wait();
        txHash = receipt.hash;
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain updateRecordStatus thất bại: ${blockchainError.message}`);
    }

    // Cập nhật trạng thái trong MongoDB
    const now = new Date();
    labOrder.sampleStatus = 'IN_PROGRESS';
    labOrder.collectedAt = now;
    labOrder.auditLogs.push({
        from: 'CONSENTED',
        to: 'IN_PROGRESS',
        by: normalizedLabTechWallet,
        at: now,
        txHash,
    });
    await labOrder.save();

    // Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedLabTechWallet,
        action: 'RECEIVE_LAB_ORDER',
        entityType: 'LAB_ORDER',
        entityId: labOrder._id,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Lab tech received lab order ${labOrderId}`,
            recordId,
        },
    });

    return {
        message: 'Tiếp nhận order thành công',
        orderId: labOrder._id.toString(),
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

    const { rawData, note } = resultData;

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // Kiểm tra trạng thái phải là IN_PROGRESS
    if (labOrder.sampleStatus !== 'IN_PROGRESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể post kết quả khi order ở trạng thái IN_PROGRESS, hiện tại: ${labOrder.sampleStatus}`);
    }

    // ✅ [HIGH FIX #3] Normalize wallet address
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

    // ✅ [MEDIUM FIX #6] Simplified: metadata stored in MongoDB
    // MongoDB-only approach - no IPFS/Storacha
    console.log(`[Lab Result] 💾 Storing result metadata to MongoDB for order: ${recordId}`);

    // 2. Tính labResultHash = keccak256(kết quả)
    const labResultString = JSON.stringify(labResultMetadata);
    const labResultHash = ethers.keccak256(ethers.toUtf8Bytes(labResultString));

    // 3. Gọi postLabResult trên EHRManager (v4 optimization - labResultIpfsHash stored off-chain)
    let txHash = null;
    let syncBlockNumber = null;
    try {
        const tx = await blockchainContracts.labTech.ehrManager.postLabResult(
            recordId,
            labResultHash
        );
        const receipt = await tx.wait();
        txHash = receipt.hash;
        syncBlockNumber = receipt.blockNumber;
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain postLabResult thất bại: ${blockchainError.message}`);
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

    // 4. Cập nhật trạng thái trong MongoDB
    const now = new Date();
    labOrder.sampleStatus = 'RESULT_POSTED';
    labOrder.labResultHash = labResultHash;
    labOrder.labResultData = rawData;
    labOrder.labResultNote = note;
    labOrder.processingAt = now;
    // SNAPSHOT: Store lab tech wallet snapshot for query optimization
    labOrder.labTechWalletAddress = labTechWalletSnapshot;
    // PROOF: Store tx hash (source of truth)
    labOrder.txHash = txHash;
    labOrder.auditLogs.push({
        from: 'IN_PROGRESS',
        to: 'RESULT_POSTED',
        by: normalizedLabTechWallet,
        at: now,
        txHash,
    });
    await labOrder.save();

    // STEP: Cập nhật trạng thái Hồ sơ Y tế = HAS_RESULT
    // ════════════════════════════════════════════════════════════════════════════════
    if (labOrder.relatedMedicalRecordId) {
        try {
            // [CENTRALIZED FIX] Use medicalRecordService.updateStatus() for consistent validation
            await medicalRecordService.updateStatus(labOrder.relatedMedicalRecordId, 'HAS_RESULT');
        } catch (recordError) {
            console.warn(`[Lab Result] Medical Record update failed (non-blocking):`, recordError.message);
        }
    }

    // STEP: Tạo Kết quả Xét nghiệm (lớp phân tích AI)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
        console.log(`[Lab Result] Creating TestResult for AI analysis...`);

        // Gọi FastAPI để lấy AI analysis
        let aiAnalysis = {};
        if (labOrder.recordType === 'DIABETES_TEST') {
            try {
                const { patientModel } = await import('~/models/patient.model');
                const patient = await patientModel.findById(labOrder.patientId);
                const age = patient ? new Date().getFullYear() - patient.birthYear : 0;

                console.log(`[Lab Result] Calling FastAPI: ${AI_SERVICE_URL}`);

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
                    console.log(`[Lab Result] AI analysis complete:`, aiAnalysis);
                } else {
                    console.warn(`[Lab Result] AI service returned non-OK status: ${aiResponse.status}`);
                }
            } catch (aiError) {
                console.warn(`[Lab Result] AI service failed (non-blocking):`, aiError.message);
            }
        }

        // Tạo TestResult
        const { testResultModel } = await import('~/models/testResult.model');
        const testResult = await testResultModel.createNew({
            labOrderId: labOrder._id,
            medicalRecordId: labOrder.relatedMedicalRecordId,
            patientId: labOrder.patientId,
            createdBy: currentUser._id,
            testType: labOrder.recordType,
            aiAnalysis,  // ✅ ONLY aiAnalysis, NO rawData
        });

        // Link TestResult vào LabOrder
        labOrder.testResultId = testResult._id;
        await labOrder.save();

        console.log(`[Lab Result] TestResult created and linked: ${testResult._id}`);
    } catch (testResultError) {
        console.warn(`[Lab Result] TestResult creation failed (non-blocking):`, testResultError.message);
        // Non-blocking: main flow continues even if TestResult creation fails
    }

    // 5. Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedLabTechWallet,
        action: 'POST_LAB_RESULT',
        entityType: 'LAB_ORDER',
        entityId: labOrder._id,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Lab tech posted result for lab order ${labOrderId}`,
            recordId,
            labResultHash,
        },
    });

    return {
        message: 'Post kết quả thành công',
        orderId: labOrder._id.toString(),
        testResultId: labOrder.testResultId?.toString(),  // ✅ Include TestResult ID in response
        blockchainRecordId: recordId,
        txHash,
        status: 'RESULT_POSTED',
        labResultHash,
        updatedAt: now,
    };
};

// Step 7: Bác sĩ thêm diễn giải lâm sàng
const addClinicalInterpretation = async (currentUser, labOrderId, interpretationData) => {
    // [Sửa #1] Xác thực role = DOCTOR (dùng helper để đảm bảo nhất quán)
    // [Sửa #2] Xác thực status = ACTIVE
    await verifyRole(currentUser, 'DOCTOR');

    const { interpretation, recommendation, confirmedDiagnosis, interpreterNote } = interpretationData;

    // ✅ REQUIRED: confirmedDiagnosis MUST be explicitly provided by doctor
    // Tại sao: Chẩn đoán ban đầu (tại thời điểm tạo lab order) chỉ là một giả thuyết
    // Chẩn đoán xác nhận (sau khi đọc lab results) có thể hoàn toàn khác
    // Ví dụ:
    //   - Ban đầu: E11 (Nghi ngờ Đái tháo đường tipo 2)
    //   - Sau HbA1c 5.8%: Tiền tiểu đường (khác!)
    //
    // CHIẾN LƯỢC ĐIỂM TRƯỚC FRONTEND (KHÔNG tự động backend):
    // Khi mở biểu mẫu "Thêm Diễn giải", frontend nên:
    //   1. Lấy hồ sơ bệnh án cũ → lấy chẩn đoán có
    //   2. Tự điền confirmedDiagnosis bằng giá trị này
    //   3. Bác sĩ review và có thể sửa nếu cần
    // Đảm bảo: bác sĩ xác minh mỗi chẩn đoán trước khi xác nhận
    //
    // Tương tự: Epic EHR, OpenMRS, các hệ thống sản xuất khác
    if (!confirmedDiagnosis) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Field "confirmedDiagnosis" is REQUIRED. Doctor must explicitly confirm diagnosis after reviewing lab results. (Frontend should pre-fill from medical record.diagnosis for convenience)'
        );
    }

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // 🆕 FIX: If requiredLevel missing (old orders), calculate and save it
    if (!labOrder.requiredLevel) {
        const RECORD_TYPE_MAP = {
            GENERAL: 0,
            HIV_TEST: 1,
            DIABETES_TEST: 2,
            LAB_RESULT: 3,
        };
        const calculatedLevel = labOrder.recordType === 'HIV_TEST' ? 3 : 2;
        labOrder.requiredLevel = calculatedLevel;
        await labOrder.save({ validateBeforeSave: false });
        console.log(`[Clinical Interpretation] ✅ Auto-fixed missing requiredLevel: ${calculatedLevel}`);
    }

    // STATE VALIDATION: Only after results posted
    if (labOrder.sampleStatus !== 'RESULT_POSTED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Chỉ có thể thêm diễn giải khi order ở trạng thái RESULT_POSTED, hiện tại: ${labOrder.sampleStatus}`);
    }

    const recordId = labOrder.blockchainRecordId;
    if (!recordId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Order không có blockchainRecordId');
    }

    // 1. Prepare interpretation metadata for storage
    // [HIGH FIX #3] Normalize wallet address
    const normalizedDoctorAddress = normalizeWalletAddress(currentUser.walletAddress);
    const interpretationMetadata = {
        interpretation,
        recommendation,
        confirmedDiagnosis,
        doctor: normalizedDoctorAddress,
        interpretedAt: new Date().toISOString(),
    };

    //  [MEDIUM FIX #6] Simplified: metadata stored in MongoDB
    // MongoDB-only approach - no IPFS/Storacha
    console.log(`[Clinical Interpretation] 💾 Storing interpretation metadata to MongoDB for order: ${recordId}`);

    // 2. 🆕 Tính interpretationHash = keccak256(interpretation + recommendation) - Blockchain standard
    // Using ethers.keccak256 (v6) instead of web3-utils
    const interpretationHash = ethers.keccak256(
        ethers.toUtf8Bytes(interpretation + (recommendation || ''))
    );

    // [CRITICAL FIX #1] Verify access control before blockchain call
    const normalizedPatientAddr = labOrder.patientAddress.toLowerCase();
    const normalizedDoctorAddr = currentUser.walletAddress.toLowerCase();
    const requiredLevelForCheck = labOrder.requiredLevel || 2;

    console.log(`[Clinical Interpretation] 🔐 Access check params:`);
    console.log(`  Patient: ${normalizedPatientAddr}`);
    console.log(`  Doctor: ${normalizedDoctorAddr}`);
    console.log(`  Required Level: ${requiredLevelForCheck} (0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE)`);
    console.log(`  labOrder.requiredLevel from DB: ${labOrder.requiredLevel}`);
    console.log(`  [DEBUG] AccessControl instance: ${blockchainContracts.read.accessControl.target}`);

    try {
        // Check if doctor is doctor on blockchain
        const isDoctorOnChain = await blockchainContracts.read.accountManager.isDoctor(normalizedDoctorAddr);
        console.log(`  Is doctor on blockchain? ${isDoctorOnChain}`);

        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            normalizedPatientAddr,
            normalizedDoctorAddr,
            requiredLevelForCheck
        );
        console.log(`  checkAccessLevel result: ${hasAccess}`);

        if (!hasAccess) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Doctor does not have access to this patient for clinical interpretation');
        }
    } catch (accessError) {
        if (accessError.statusCode === StatusCodes.FORBIDDEN) throw accessError;
        console.error(`[Clinical Interpretation] ⚠️ Access check error:`, accessError.message);
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Access verification failed: ${accessError.message}`);
    }

    // 3. Gọi addClinicalInterpretation trên EHRManager (v4 optimization - interpretationIpfsHash stored off-chain)
    // ✅ [CRITICAL FIX #2] Use doctor wallet (not admin) to sign interpretation - ensures accountability
    let txHash = null;
    let syncBlockNumber = null;

    // 🆕 DEBUG: Log all parameters before blockchain call
    console.log(`[Clinical Interpretation] DEBUG - Before blockchain call:`);
    console.log(`  recordId: ${recordId}`);
    console.log(`  interpretationHash: ${interpretationHash}`);
    console.log(`  labOrder.sampleStatus: ${labOrder.sampleStatus}`);
    console.log(`  labOrder.patientAddress: ${labOrder.patientAddress}`);
    console.log(`  currentUser.walletAddress: ${currentUser.walletAddress}`);

    try {
        //  DEBUG: Verify contract instances are the SAME
        console.log(`[Clinical Interpretation]  DEBUG - CONTRACT INSTANCES:`);
        console.log(`  READ ehrManager: ${blockchainContracts.read.ehrManager.target}`);
        console.log(`  WRITE ehrManager (doctor): ${blockchainContracts.doctor.ehrManager.target}`);
        console.log(`  Are they same? ${blockchainContracts.read.ehrManager.target === blockchainContracts.doctor.ehrManager.target ? '✅ YES' : '❌ NO'}`);

        // 🆕 CRITICAL FIX: Use the CORRECT signer
        // The blockchain transaction must be signed by the doctor whose wallet was used
        // in the access grant. This MUST match the doctor's currentUser.walletAddress
        const doctorSigner = blockchainContracts.doctor.ehrManager;

        console.log(`[Clinical Interpretation] 🔐 Transaction Signer Address Check:`);
        console.log(`  doctorSigner.signer.address: ${doctorSigner.signer?.address || 'NOT AVAILABLE'}`);
        console.log(`  currentUser.walletAddress: ${normalizedDoctorAddr}`);
        console.log(`  Match? ${doctorSigner.signer?.address?.toLowerCase() === normalizedDoctorAddr ? '✅ YES' : '❌ MISMATCH'}`);

        if (doctorSigner.signer?.address?.toLowerCase() !== normalizedDoctorAddr) {
            console.warn(`⚠️  WARNING: Transaction signer (${doctorSigner.signer?.address}) does not match current doctor (${normalizedDoctorAddr})`);
            console.warn(`     This will cause blockchain AccessDenied error!`);
            console.warn(`     Make sure doctor is logged in with wallet: ${doctorSigner.signer?.address}`);
        }

        const tx = await doctorSigner.addClinicalInterpretation(
            recordId,
            interpretationHash
        );
        console.log(`[Clinical Interpretation] Transaction sent, waiting for receipt...`);
        const receipt = await tx.wait();
        txHash = receipt.hash;
        syncBlockNumber = receipt.blockNumber;
        console.log(`[Clinical Interpretation] ✅ Blockchain call SUCCESS - txHash: ${txHash}`);
    } catch (blockchainError) {
        console.error(`[Clinical Interpretation] ❌ Blockchain error details:`);
        console.error(`  Message: ${blockchainError.message}`);
        console.error(`  Data: ${blockchainError.data}`);
        console.error(`  Transaction data:`, blockchainError.transaction);

        // 🆕 Try to get fresh access grant info to see current state
        try {
            console.log(`[Clinical Interpretation] ❌ DIAGNOSIS - Fetching current access grant state...`);
            const blockchainRecord = await blockchainContracts.read.ehrManager.getRecord(recordId);
            const freshGrant = await blockchainContracts.read.accessControl.getAccessGrant(
                blockchainRecord.patient,
                normalizedDoctorAddress
            );
            console.log(`  Fresh access grant for ${normalizedDoctorAddress}:`);
            console.log(`    - isActive: ${freshGrant.isActive}`);
            console.log(`    - expiresAt: ${BigInt(freshGrant.expiresAt).toString()}`);
            console.log(`    - level: ${freshGrant.level}`);

            const now = Math.floor(Date.now() / 1000);
            if (freshGrant.expiresAt > 0n) {
                console.log(`    - expires in: ${(Number(freshGrant.expiresAt) - now) / 3600} hours`);
            }
        } catch (diagErr) {
            console.warn(`  Could not fetch diagnosis info:`, diagErr.message);
        }

        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain addClinicalInterpretation thất bại: ${blockchainError.message}`);
    }

    // 4. CRITICAL: Update MongoDB status FIRST before async operations
    // Ensure status is persisted to database immediately
    const now = new Date();
    labOrder.sampleStatus = 'DOCTOR_REVIEWED';
    labOrder.interpretationHash = interpretationHash;
    labOrder.clinicalInterpretation = interpretation;
    labOrder.recommendation = recommendation;
    labOrder.interpreterNote = interpreterNote;
    labOrder.doctorId = currentUser._id?.toString();
    // 🔹 SNAPSHOT: Store doctor wallet snapshot for query optimization
    labOrder.doctorWalletAddress = normalizedDoctorAddress;
    // 🔐 PROOF: Store tx hash (source of truth - msg.sender embedded in blockchain)
    labOrder.txHash = txHash;
    labOrder.auditLogs.push({
        from: 'RESULT_POSTED',
        to: 'DOCTOR_REVIEWED',
        by: normalizedDoctorAddress,
        at: now,
        txHash,
    });

    try {
        await labOrder.save();
        console.log(`[Clinical Interpretation] ✅ MongoDB status updated to DOCTOR_REVIEWED`);
    } catch (saveError) {
        console.error(`[Clinical Interpretation] ❌ CRITICAL: Failed to persist status update to MongoDB:`, saveError.message);
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Failed to save clinical interpretation status: ${saveError.message}`);
    }

    // 🆕 Ghi audit log trực tiếp với txHash (blockchain là authority)
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedDoctorAddress,
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

    // STEP 7.5: AUTO-SYNC medical record with confirmed diagnosis
    let syncStatus = 'PENDING';
    if (labOrder.relatedMedicalRecordId) {
        try {
            const { medicalRecordService } = require('./medicalRecord.service');
            await medicalRecordService.syncConfirmedDiagnosisFromInterpretation(
                labOrder.relatedMedicalRecordId,
                {
                    confirmedDiagnosis,
                    interpretationHash,
                    doctorId: currentUser._id,
                    // 🆕 NOTE: NO labOrderId needed here
                    // Relationship already created in Step 3 (Early Binding)
                }
            );
            syncStatus = 'COMPLETED';
            console.log('✅ Medical record diagnosis synced successfully (relationship existed since Step 3)');
        } catch (syncErr) {
            console.error('⚠️ Sync to medical record FAILED:', syncErr.message);
            console.error('ℹ️ Will retry later - main flow remains valid');
            syncStatus = 'FAILED_RETRY_LATER';
            // DON'T throw - don't fail main flow if sync fails
        }
    }

    // 5. Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedDoctorAddress,
        action: 'ADD_CLINICAL_INTERPRETATION',
        entityType: 'LAB_ORDER',
        entityId: labOrder._id,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Doctor added clinical interpretation for lab order ${labOrderId}`,
            recordId,
            interpretationHash,
            confirmedDiagnosis,
            syncStatus,
        },
    });

    return {
        message: 'Thêm diễn giải lâm sàng thành công',
        orderId: labOrder._id.toString(),
        blockchainRecordId: recordId,
        txHash,
        status: 'DOCTOR_REVIEWED',
        interpretationHash,
        confirmedDiagnosis,
        syncStatus,  // 🆕 Tell client sync status
        updatedAt: now,
    };
};

// Step 8: Bác sĩ chốt hồ sơ
/**
 * 🎯 AFTER-COMPLETE ACCESS CONTROL ARCHITECTURE
 * ================================================
 * 
 * DECISION: Keep doctor access ACTIVE (no revoke)
 * 
 * RATIONALE:
 * ✅ Audit trail visibility: Doctor can view completed records for legal compliance
 * ✅ Follow-up care: Doctor may need to reference patient's diagnoses later
 * ✅ Medical continuity: Next encounter starts from COMPLETE record
 * ❌ Full revoke: Would break audit trail (lose access to proof)
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
const completeRecord = async (currentUser, labOrderId) => {
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

    // [MEDIUM FIX #1] Pre-validate status before blockchain call
    const labOrderForComplete = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (labOrderForComplete && labOrderForComplete.sampleStatus !== 'DOCTOR_REVIEWED') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Expected status DOCTOR_REVIEWED but found ${labOrderForComplete.sampleStatus}. Cannot finalize record`);
    }

    // Gọi updateRecordStatus trên EHRManager: DOCTOR_REVIEWED → COMPLETE
    // [CRITICAL FIX #3] Use doctor wallet (not admin) to sign finalization - ensures doctor accountability
    let txHash = null;
    try {
        const tx = await blockchainContracts.doctor.ehrManager.updateRecordStatus(recordId, 5); // COMPLETE = 5
        const receipt = await tx.wait();
        txHash = receipt.hash;
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain updateRecordStatus thất bại: ${blockchainError.message}`);
    }

    // Cập nhật trạng thái trong MongoDB
    const now = new Date();
    // [HIGH FIX #3] Normalize wallet address
    const normalizedDoctorWallet = normalizeWalletAddress(currentUser.walletAddress);

    labOrder.sampleStatus = 'COMPLETE';
    labOrder.completedAt = now; // IMPORTANT: Set completedAt field
    labOrder.auditLogs.push({
        from: 'DOCTOR_REVIEWED',
        to: 'COMPLETE',
        by: normalizedDoctorWallet,
        at: now,
        txHash,
    });
    await labOrder.save();

    // 🔥 [STATE PROPAGATION] Sync Medical Record status when Lab Order COMPLETE
    // ✅ Rule: Lab Order = source of truth
    //    Medical Record = dependent (must follow)
    // ✅ When Lab Order COMPLETE → Medical Record also COMPLETE
    if (labOrder.relatedMedicalRecordId) {
        try {
            // [CENTRALIZED FIX] Use medicalRecordService.updateStatus() for consistent validation
            await medicalRecordService.updateStatus(labOrder.relatedMedicalRecordId, 'COMPLETE');
        } catch (syncErr) {
            console.error(`[STATE SYNC] Failed to update medical record: ${syncErr.message}`);
            // Log but don't throw - lab order is already complete
            // Medical record update is async side effect, not critical path
        }
    }

    // Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedDoctorWallet,
        action: 'COMPLETE_RECORD',
        entityType: 'LAB_ORDER',
        entityId: labOrder._id,
        txHash,
        status: 'SUCCESS',
        details: {
            note: `Doctor completed lab order ${labOrderId}`,
            recordId,
        },
    });

    return {
        message: 'Chốt hồ sơ thành công',
        orderId: labOrder._id.toString(),
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

export const ehrWorkflowService = {
    consentToOrder,
    receiveOrder,
    postLabResult,
    addClinicalInterpretation,
    completeRecord,
    directCompleteRecord,
};

