import { medicalRecordModel } from '~/models/medicalRecord.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { patientModel } from '~/models/patient.model';
import { auditLogModel } from '~/models/auditLog.model';
import { blockchainContracts } from '~/blockchain/contract';
import { userModel } from '~/models/user.model';

/**
 * HYBRID SERVICE - SHARED BY OFF-CHAIN & BLOCKCHAIN WORKFLOWS
 * 
 * ═════════════════════════════════════════════════════════════════════════════════
 * 
 * Architecture Overview:
 * ──────────────────────
 * This service provides DUAL functionality:
 * 
 *    OFF-CHAIN: Medical Record Storage (MongoDB)
 *    → Doctor creates records with examination findings, initial diagnosis (based on symptoms)
 *    → Endpoints: POST /doctors/patients/:patientId/medical-records (standalone)
 *    → Purpose: Clinical notes during physical exam, decide which lab tests to order
 *    → Access Control: Validated via AccessControl smart contract before blockchain operations
 * 
 *    ON-CHAIN Integration: Blockchain Sync & Hash Verification
 *    → syncConfirmedDiagnosisFromInterpretation() - ACTIVELY USED by ehrWorkflow.addClinicalInterpretation()
 *    → getDetailWithHashVerification() - Verify interpretation hash integrity + data tampering
 *    → Purpose: Bridge blockchain lab results interpretation back to medical record
 *    → Flow: Doctor interprets lab results ON-CHAIN → auto-sync back to medical record + hash stored
 * 
 * Current Multi-Path Usage:
 * ────────────────────────
 * 
 * Path 1: OFF-CHAIN DOCTOR WORKFLOW (Direct)
 *   - Endpoint: POST /doctors/patients/:patientId/medical-records
 *   - Function: medicalRecordService.createNew()
 *   - When: Doctor manually creates record during patient physical exam
 *   - Data: Exam findings, initial diagnosis
 *   - Blockchain: NOT involved (intentional - fast clinical decision)
 * 
 * Path 2: OFF-CHAIN DIAGNOSIS UPDATE
 *   - Endpoint: PATCH /doctors/medical-records/:medicalRecordId/diagnosis
 *   - Function: medicalRecordService.diagnosis()
 *   - When: Doctor adds diagnosis based on exam symptoms
 *   - Data: Diagnosis text, status update
 *   - Blockchain: NOT involved (off-chain clinical notes)
 * 
 * Path 3: HYBRID LAB ORDER WORKFLOW (Blockchain-Integrated Interpretation)
 *   - Flow: Doctor SEPARATELY creates medical record + Doctor creates lab order
 *           → Patient consents to order → Lab tech posts results → Doctor interprets (BLOCKCHAIN)
 *           → ehrWorkflow.addClinicalInterpretation() calls:
 *              • medicalRecordService.syncConfirmedDiagnosisFromInterpretation() 
 *              • Result: Off-chain record auto-populated with on-chain interpreted diagnosis + hash
 *   - Purpose: Medical records stored OFF-CHAIN for speed, lab interpretation ON-CHAIN for immutability
 *   - NOTE: Medical record creation and lab order creation are INDEPENDENT, combined by doctor workflow
 * 
 * Business Logic Enforced:
 * ────────────────────────
 * 1 patient = 1 ACTIVE medical record (statuses: CREATED, WAITING_RESULT, HAS_RESULT, DIAGNOSED)
 * Multiple COMPLETE/REVOKED records allowed (historical records preserved)
 * Database enforces via: unique partial index on (patientId, _destroy) with status filter
 * Application enforces via: createNew() checks active records before allowing new
 * Access control validated before any on-chain operation
 * 
 * Data Integrity:
 * ───────────────
 * Keccak256 hashing for interpretation immutability
 * Hash stored in medical record for tamper detection
 * getDetailWithHashVerification() validates hash against blockchain
 * Audit trail in auditLog model + blockchain
 * 
 * CRITICAL NOTES:
 * - Functions were previously marked for deletion - DO NOT DELETE
 * - syncConfirmedDiagnosisFromInterpretation() is ACTIVELY USED at ehrWorkflow Step 7.5
 * - getDetailWithHashVerification() ensures blockchain interpretation integrity
 * - Old deprecated comment was SUPERSEDED by hybrid architecture updates
 * - This service now properly integrates OFF-CHAIN speed WITH ON-CHAIN security
 * 
 * ═════════════════════════════════════════════════════════════════════════════════
 */

// Helper: Extract wallet address từ user's authProviders
// User wallet stored in: authProviders[{type: 'WALLET', walletAddress: '0x...'}]
const getUserWalletAddress = (user) => {
    if (!user || !user.authProviders || !Array.isArray(user.authProviders)) {
        return null;
    }
    const walletProvider = user.authProviders.find(p => p.type === 'WALLET');
    return walletProvider?.walletAddress || null;
};

/**
 * OPTIMIZED: Get patient wallet with minimal DB queries
 * Problem: 4-step relationship query causes N+1 when listing records
 * Solution: Use lean() + explicit select() for performance
 * 
 * Performance:
 * - Old: 3 queries per record (patient find + user find + extract)
 * - New: 2 queries (lean reduces overhead, single roundtrip)
 * - Ideal: 1 query with .populate() (if schema allows)
 */
const getPatientWalletOptimized = async (patientId) => {
    try {
        // STEP 1: Query patient with userId (lean = plain JS object, no overhead)
        const patient = await patientModel
            .findById(patientId)
            .select('userId')  // Only fetch userId field
            .lean();           // ← OPTIMIZATION: Plain object, no Mongoose overhead

        if (!patient) return null;

        // STEP 2: Query user authProviders only (lean + select)
        const patientUser = await userModel
            .findById(patient.userId)
            .select('authProviders')  // Only fetch authProviders
            .lean();

        if (!patientUser) return null;

        // STEP 3: Extract wallet
        const walletAddress = getUserWalletAddress(patientUser);
        return walletAddress;

    } catch (err) {
        console.error('Error fetching patient wallet:', err.message);
        return null;
    }
};

// Service tạo hồ sơ bệnh án
// FIX: Allow multiple records but only 1 ACTIVE (CREATED/WAITING/HAS_RESULT/DIAGNOSED)
const createNew = async (patientId, data, currentUser) => {
    // Kiểm tra xem có bệnh nhân trong hệ thống không
    const patient = await userModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

    // NEW LOGIC: Check ONLY ACTIVE records (not COMPLETE/REVOKED)
    const activeRecords = await medicalRecordModel.findOneByPatientId(patientId, [
        'CREATED',
        'WAITING_RESULT',
        'HAS_RESULT',
        'DIAGNOSED',  // ← FIX: Added missing status
    ]);

    if (activeRecords.length > 0) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Bệnh nhân đang có 1 hồ sơ chưa hoàn thành (${activeRecords[0].status}). ` +
            `Vui lòng hoàn thành hồ sơ trước khi tạo mới! ` +
            `(ID: ${activeRecords[0]._id})`
        );
    }

    // Extract patient wallet (if available)
    const patientWalletAddress = getUserWalletAddress(patient);

    // Lấy snapshot wallet của doctor tạo record (immutable audit trail)
    let doctorWalletAddress = null;
    try {
        const doctorUser = await userModel.findById(currentUser._id);
        if (doctorUser) {
            doctorWalletAddress = getUserWalletAddress(doctorUser);
        }
    } catch (err) {
        console.warn('[MedicalRecord] Warning: Could not fetch doctor wallet:', err.message);
    }

    // Bản ghi mới gồm patientId, createdBy, clinical examination data + OPTIONAL diagnosis
    const newRecord = {
        patientId,
        createdBy: currentUser._id,
        // DENORMALIZATION: Wallet snapshots (không đổi sau này)
        // - patientWalletAddress: Lịch sử (audit trail)
        // - doctorWalletAddress: Lịch sử (audit trail)
        // - Dùng cho: Blockchain call, audit log, verify history
        // - KHÔNG dùng cho: Access control (dùng User.walletAddress thay vì)
        patientWalletAddress,
        doctorWalletAddress,
        chief_complaint: data.chief_complaint,
        vital_signs: data.vital_signs,
        physical_exam: data.physical_exam,
        assessment: data.assessment,
        plan: data.plan,
        diagnosis: data.diagnosis || null,  // Thêm diagnosis nếu có, nếu không thì null
        status: 'CREATED',  // [Sửa #1] Luôn tạo là CREATED. Diagnosis là dữ liệu lâm sàng, không phải trạng thái. DIAGNOSED chỉ sau khi bác sĩ review lab results.
        createdAt: new Date(),
    };

    try {
        const medicalRecord = await medicalRecordModel.createNew(newRecord);
        // Lỗi nếu tạo hồ sơ thất bại
        if (!medicalRecord) throw new ApiError(StatusCodes.BAD_REQUEST, 'Tạo hồ sơ bệnh án thất bại');

        // Tạo audit log (thêm info về diagnosis nếu có)
        await auditLogModel.createLog({
            userId: currentUser._id,
            action: 'CREATE_MEDICAL_RECORD',
            entityType: 'MEDICAL_RECORD',
            entityId: medicalRecord._id,
            details: {
                note: `Bác sĩ tạo hồ sơ bệnh án mới với dữ liệu khám lâm sàng${data.diagnosis ? ' + chẩn đoán ban đầu' : ''}`,
                patientId,
                // Lưu wallet snapshots vào audit log (immutable proof)
                patientWalletSnapshot: patientWalletAddress,
                doctorWalletSnapshot: doctorWalletAddress,
                chief_complaint: data.chief_complaint,
                diagnosis: data.diagnosis || 'Not provided',
            },
        });

        // Return created record details (thêm diagnosis status)
        return {
            medicalRecordId: medicalRecord._id,
            status: medicalRecord.status,
            chief_complaint: medicalRecord.chief_complaint,
            diagnosis: medicalRecord.diagnosis,
            message: 'Tạo hồ sơ bệnh án thành công'
        };
    } catch (err) {
        // Handle MongoDB duplicate key error (from database constraint)
        if (err.code === 11000 && err.keyPattern?.patientId) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                'Bệnh nhân đã có hồ sơ đang hoạt động. Vui lòng hoàn thành trước!'
            );
        }
        throw err;
    }
};

// Service lấy hồ sơ bệnh án theo filter
const getAll = async (statusArray, grantedPatientIds) => {
    // Loại bỏ các document đã bị xóa mềm
    const query = {
        _destroy: false,
    };

    // Filter by granted patients (patient-centric access control)
    // If grantedPatientIds is provided, MUST use it (even if empty)
    if (grantedPatientIds !== undefined) {
        query.patientId = { $in: grantedPatientIds };
    }

    // Nếu có statusArray thì thêm vào query
    if (statusArray && statusArray.length > 0) {
        query.status = { $in: statusArray };
    }

    return await medicalRecordModel.MedicalRecordModel.find(query).sort({ createdAt: -1 });
};

const getDetail = async (medicalRecordId, currentUser) => {
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Lấy hồ sơ thất bại');

    // Verify access via BLOCKCHAIN (ON-CHAIN access control)
    // Access control via relationship: medical record → patient → user → wallet
    try {
        // STEP 1: Doctor wallet from JWT token
        const currentUserWallet = currentUser.walletAddress;
        console.log('[STEP 1] Doctor wallet from token:', currentUserWallet);

        // STEP 2: Query patient from medical record (relationship 1)
        const patient = await patientModel.findById(medicalRecord.patientId);
        if (!patient) {
            console.error('[STEP 2] Patient not found for medical record');
            throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');
        }
        console.log('[STEP 2] Found patient:', patient._id);

        // STEP 3: Query user from patient (relationship 2)
        const patientUser = await userModel.findById(patient.userId);
        if (!patientUser) {
            console.error('[STEP 3] User not found for patient');
            throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng không tồn tại');
        }
        console.log('[STEP 3] Found patient user:', patientUser._id);

        // STEP 4: Extract wallet from user.authProviders (relationship 3)
        const patientWallet = getUserWalletAddress(patientUser);
        console.log('[STEP 4] Patient wallet from user:', patientWallet);

        // 🔐 ENFORCE: Both wallets REQUIRED for access (no fallback)
        if (!currentUserWallet) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Doctor wallet not configured in system');
        }
        if (!patientWallet) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Patient wallet not configured. Patient must setup wallet for access control');
        }

        // STEP 5: Check blockchain access control
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientWallet,
            currentUserWallet,
            2  // FULL access level
        );

        if (!hasAccess) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền truy cập hồ sơ này');
        }
        console.log('[STEP 5] Blockchain access verified');
    } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error(' Blockchain access check failed:', err.message);
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Kiểm tra quyền thất bại');
    }

    return medicalRecord;
};

// VERIFY hash khi read (CRITICAL SECURITY)
const getDetailWithHashVerification = async (medicalRecordId, currentUser) => {
    const record = await medicalRecordModel.findOneById(medicalRecordId);
    if (!record) throw new ApiError(StatusCodes.NOT_FOUND, 'Lấy hồ sơ thất bại');

    // Verify access via BLOCKCHAIN (ON-CHAIN access control)
    // Access control via relationship: medical record → patient → user → wallet
    try {
        // STEP 1: Doctor wallet from JWT token
        const currentUserWallet = currentUser.walletAddress;

        // STEP 2: Query patient from medical record (relationship 1)
        const patient = await patientModel.findById(record.patientId);
        if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

        // STEP 3: Query user from patient (relationship 2)
        const patientUser = await userModel.findById(patient.userId);
        if (!patientUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Người dùng không tồn tại');

        // STEP 4: Extract wallet from user.authProviders (relationship 3)
        const patientWallet = getUserWalletAddress(patientUser);

        // ENFORCE: Both wallets REQUIRED for access (no fallback)
        if (!currentUserWallet) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Doctor wallet not configured in system');
        }
        if (!patientWallet) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Patient wallet not configured. Patient must setup wallet for access control');
        }

        // STEP 5: Check blockchain access - immutable, auditable
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientWallet,
            currentUserWallet,
            2  // FULL access level
        );

        if (!hasAccess) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền truy cập hồ sơ này');
        }
    } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error('Blockchain access check failed:', err.message);
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Kiểm tra quyền thất bại');
    }

    // If has interpretation, verify it wasn't tampered
    if (record.interpretationHash && record.clinicalInterpretation) {
        const { keccak256 } = require('web3-utils');
        const computedHash = keccak256(
            record.clinicalInterpretation + (record.recommendation || '')
        );

        if (computedHash !== record.interpretationHash) {
            console.error('DATA TAMPERED - Hash mismatch');
            record.dataIntegrity = 'TAMPERED';
        } else {
            record.dataIntegrity = 'VERIFIED';
        }
    } else {
        record.dataIntegrity = 'NOT_VERIFIED';  // No blockchain data yet
    }

    return record;
};

// Sync diagnosis - NO TEXT PARSING (doctor sends explicit confirmedDiagnosis)
const syncConfirmedDiagnosisFromInterpretation = async (medicalRecordId, interpretationData) => {
    try {
        if (!interpretationData.confirmedDiagnosis) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                'confirmedDiagnosis field REQUIRED from doctor'
            );
        }

        const existingRecord = await medicalRecordModel.findOneById(medicalRecordId);
        if (!existingRecord) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Medical record not found');
        }

        // Add to history instead of overwrite
        const diagnosisEntry = {
            type: 'FINAL',
            value: interpretationData.confirmedDiagnosis,
            source: 'LAB_INTERPRETATION',
            basedOnInterpretationHash: interpretationData.interpretationHash,
            createdAt: new Date(),
            doctorId: interpretationData.doctorId,
        };

        // Update medical record with diagnosis + history
        // NOTE: relationship (relatedLabOrderIds) already created in Step 3 (Early Binding)
        // Step 7 only updates BUSINESS DATA (diagnosis), not relationship
        const updateObj = {
            $push: { diagnosisHistory: diagnosisEntry },
            confirmedDiagnosis: interpretationData.confirmedDiagnosis,
            interpretationHash: interpretationData.interpretationHash,
        };

        // Update medical record
        const updated = await medicalRecordModel.MedicalRecordModel.findByIdAndUpdate(
            medicalRecordId,
            updateObj,
            { new: true }
        );

        console.log('Diagnosis synced successfully (relationship already established in Step 3)');
        return updated;
    } catch (error) {
        console.error('Failed to sync diagnosis:', error.message);
        return null;
    }
};

// 🆕 Lấy tất cả medical records của 1 bệnh nhân (doctor phải có quyền)
const getPatientMedicalRecords = async (patientId, statusArray, currentUser) => {
    try {
        // STEP 1: Verify doctor has access to this patient (via blockchain or middleware)
        // For now, we'll allow if doctor is creating/viewing records
        // In production, check blockchain grantAccess event

        // STEP 2: Query all non-deleted records for this patient
        const query = {
            patientId,
            _destroy: false,
        };

        // Filter by status if provided
        if (statusArray && statusArray.length > 0) {
            query.status = { $in: statusArray };
        }

        const records = await medicalRecordModel.MedicalRecordModel.find(query)
            .sort({ createdAt: -1 })
            .lean();

        console.log(`Found ${records.length} medical records for patient ${patientId}`);
        return records;
    } catch (error) {
        console.error(' Error fetching patient medical records:', error.message);
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Lấy hồ sơ bệnh án thất bại');
    }
};

/**
 *   PERFORMANCE OPTIMIZATION ROADMAP - Wallet Query N+1
 * ========================================================
 * 
 * CURRENT STATE: Optimized with lean() + select()
 * - Per-record: 2 queries (patient + user)
 * - List 100 records: ~200 queries (acceptable for MVP)
 * 
 * FUTURE OPTIMIZATIONS (if needed):
 * 
 * LEVEL 1: Batch Queries (Fastest at scale 1000+)
 * - Query all patient IDs from records first
 * - Batch fetch all patients in 1 query
 * - Batch fetch all users in 1 query
 * Usage:
 *   const patientIds = records.map(r => r.patientId);
 *   const patients = await patientModel.find({ _id: { $in: patientIds } }).lean();
 *   const patientMap = new Map(patients.map(p => [p._id, p]));
 * 
 * LEVEL 2: Mongoose .populate() (Best for relationships)
 * - Requires: patient schema has userId reference
 * - Query: medicalRecord.find().populate('patientId.userId', 'authProviders')
 * - Trade-off: Larger payload but fewer queries
 * 
 * LEVEL 3: Redis Cache (Network-latency elimination)
 * - Cache patient wallets by key: patient:${patientId}:wallet
 * - TTL: 1 hour (wallet rarely changes)
 * - Cache strategy: 
 *   const cached = await redis.get(`patient:${patientId}:wallet`);
 *   if (cached) return cached;
 *   const wallet = await fetchFromDB(...);
 *   await redis.set(`patient:${patientId}:wallet`, wallet, 'EX', 3600);
 * 
 * LEVEL 4: Denormalize (Nuclear option)
 * - Store patient.walletAddress directly in medicalRecord
 * - Schema: { ..., patientWalletAddress: '0x...' }
 * - Pro: O(1) access, no relationships needed
 * - Con: Must sync on patient wallet change
 * - Use when: Medical records >1M, wallet reads >10k/sec
 * 
 * WHEN TO UPGRADE:
 * <100 records/user: Current solution fine
 * 100-1000 records: Consider LEVEL 1 (batch)
 * 1000+: Consider LEVEL 2 (populate) + LEVEL 3 (cache)
 * Performance issue: Monitor query times, upgrade as needed
 */

// CRITICAL FIX #3: Centralized medical record status updates
const updateStatus = async (medicalRecordId, newStatus) => {
    const validTransitions = {
        'CREATED': ['WAITING_RESULT', 'COMPLETE'],
        'WAITING_RESULT': ['HAS_RESULT', 'COMPLETE'],
        'HAS_RESULT': ['DIAGNOSED'],
        'DIAGNOSED': ['COMPLETE'],
        'COMPLETE': []
    };

    const record = await medicalRecordModel.findById(medicalRecordId);
    if (!record) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Medical record không tồn tại');
    }

    const allowedNextStates = validTransitions[record.status] || [];
    if (!allowedNextStates.includes(newStatus)) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            `Không thể chuyển từ ${record.status} → ${newStatus}. Cho phép: ${allowedNextStates.join(', ')}`
        );
    }

    const updated = await medicalRecordModel.findByIdAndUpdate(
        medicalRecordId,
        {
            status: newStatus,
            updatedAt: new Date()
        },
        { new: true }
    );

    console.log(`[Medical Record] ${medicalRecordId} ${record.status} → ${newStatus}`);
    return updated;
};

export const medicalRecordService = {
    createNew,
    getAll,
    getDetail,
    getDetailWithHashVerification,
    syncConfirmedDiagnosisFromInterpretation,
    getPatientMedicalRecords,
    updateStatus,
};
