import mongoose from 'mongoose';

const COLLECTION_NAME = 'medical_records';

const MEDICAL_RECORD_TYPES = {
    HIV_TEST: 'HIV_TEST',
    LAB_RESULT: 'LAB_RESULT',
    PRESCRIPTION: 'PRESCRIPTION',
    DIABETES_TEST: 'DIABETES_TEST',
};

const MEDICAL_RECORD_STATUS = {
    CREATED: 'CREATED',
    WAITING_RESULT: 'WAITING_RESULT',
    HAS_RESULT: 'HAS_RESULT',
    DIAGNOSED: 'DIAGNOSED',
    COMPLETE: 'COMPLETE',
};

// 🆕 Diagnosis history schema for audit trail
const diagnosisHistorySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['INITIAL', 'FINAL'],
            required: true,
        },
        value: {
            type: String,
            required: true,
        },
        source: {
            type: String,
            enum: ['EXAM', 'LAB_INTERPRETATION'],
            default: 'EXAM',
        },
        basedOnInterpretationHash: String,
        doctorId: mongoose.Schema.Types.ObjectId,
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const medicalRecordSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
        },

        testResultId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'test_results',
        },

        type: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_TYPES),
            required: false,  // 🆕 OPTIONAL - New clinical exam flow doesn't require type
        },

        status: {
            type: String,
            enum: Object.values(MEDICAL_RECORD_STATUS),
            default: MEDICAL_RECORD_STATUS.CREATED,
        },

        note: {
            type: String,
        },

        // 🆕 CLINICAL EXAMINATION DATA
        chief_complaint: {
            type: String,
            required: true,
        },

        // 🆕 FLEXIBLE VITAL SIGNS - Doctor records any vital signs needed
        // Examples: {temperature: 37.5, blood_pressure: "120/80", heart_rate: 72, SpO2: 98}
        // Không cố định, tùy theo bệnh nhân
        vital_signs: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // 🆕 FLEXIBLE PHYSICAL EXAM - Doctor records findings for any body system
        // Examples: {chest: "Clear to auscultation", abdomen: "Soft, non-tender", ...}
        // Không cố định vùng khám, tùy theo bệnh nhân
        physical_exam: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        assessment: {
            type: String,
        },

        plan: [String],

        // OFF-CHAIN diagnosis (initial exam diagnosis)
        diagnosis: {
            type: String,
        },

        // 🆕 CONFIRMED DIAGNOSIS (after lab interpretation)
        confirmedDiagnosis: {
            type: String,
        },

        // 🆕 AUDIT TRAIL - Full history of diagnosis changes
        diagnosisHistory: [diagnosisHistorySchema],

        // 🆕 VERIFICATION LINK - Links to blockchain interpretation
        interpretationHash: {
            type: String,
        },

        // BLOCKCHAIN WALLET SNAPSHOTS (Denormalization)
        // ════════════════════════════════════════════════════════════
        // Lưu snapshot địa chỉ ví tại thời điểm tạo record
        // 
        // Tại sao snapshot?
        // - Audit trail (người tạo record là ai có thể thay đổi wallet)
        // - Blockchain proof (lịch sử không thể thay đổi)
        // - Performance (tránh query chain: Record → Patient → User → wallet)
        // 
        // Snapshot ≠ Source of Truth
        // - User.walletAddress = địa chỉ HIỆN TẠI (dùng cho access control)
        // - MedicalRecord.walletAddress = LỊCH SỬ (dùng cho audit + blockchain)
        // ════════════════════════════════════════════════════════════
        patientWalletAddress: {
            type: String,
            index: true,
            description: 'Snapshot của patient wallet tại thời điểm tạo record (không đổi sau này)',
        },
        doctorWalletAddress: {
            type: String,
            index: true,
            description: 'Snapshot của doctor wallet tại thời điểm tạo record (immutable audit trail)',
        },

        // RELATIONSHIP - Links to related lab orders (TWO-WAY reference)
        // Allows querying: "Which lab orders are associated with this medical record?"
        relatedLabOrderIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'lab_orders',
            },
        ],

        // VISIT INFORMATION
        // visitDate: Ngày khám (separate from createdAt which is record creation time)
        visitDate: {
            type: Date,
            required: true,
            default: Date.now,
        },

        // clinic: Nơi khám (location/facility)
        clinic: {
            type: String,
            description: 'Facility/clinic name where examination was conducted',
        },

        // FOLLOW-UP TRACKING
        // nextFollowupDate: Ngày tái khám
        nextFollowupDate: {
            type: Date,
            description: 'Scheduled date for next follow-up visit',
        },

        // URGENCY & REFERRAL
        isUrgent: {
            type: Boolean,
            default: false,
            description: 'Mark as urgent/emergency case',
        },

        isReferral: {
            type: Boolean,
            default: false,
            description: 'Whether patient referred to specialist',
        },

        referralTo: {
            type: String,
            description: 'Specialist type if referred (e.g., Cardiology, Neurology)',
        },

        // COMPLETION TIMESTAMP
        // completedAt: When doctor completed this record
        completedAt: {
            type: Date,
            description: 'When record was marked complete by doctor',
        },

        _destroy: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    },
);

// Lấy hồ sơ theo bệnh nhân
medicalRecordSchema.index({ patientId: 1, createdAt: -1 });

// Truy vấn theo loại
medicalRecordSchema.index({ type: 1 });

// 🆕 Performance indexes for new fields
medicalRecordSchema.index({ visitDate: -1 });  // Query by visit date
medicalRecordSchema.index({ nextFollowupDate: 1 });  // Find upcoming follow-ups
medicalRecordSchema.index({ isUrgent: 1, createdAt: -1 });  // Filter urgent cases
medicalRecordSchema.index({ clinic: 1 });  // Query by clinic/location

// ✅ NEW: Unique constraint - enforce "1 patient = 1 ACTIVE record" at DB level
// This prevents race conditions and ensures data integrity
medicalRecordSchema.index(
    { patientId: 1, _destroy: 1 },
    {
        name: 'unique_active_record_per_patient',
        unique: true,
        sparse: true,
        partialFilterExpression: {
            _destroy: false,
            status: { $in: ['CREATED', 'WAITING_RESULT', 'HAS_RESULT', 'DIAGNOSED'] }
        }
    }
);

const MedicalRecordModel = mongoose.model(COLLECTION_NAME, medicalRecordSchema);

const createNew = async (data) => {
    return await MedicalRecordModel.create(data);
};

const findOneById = async (id) => {
    return await MedicalRecordModel.findOne({ _id: id, _destroy: false });
};

const findOneByPatientId = async (patientId, status) => {
    return await MedicalRecordModel.find({
        patientId,
        _destroy: false,
        status: { $in: status },
    }).sort({ createdAt: -1 });
};

const revokeRecord = async (recordId, auditLogId) => {
    return await MedicalRecordModel.findByIdAndUpdate(
        recordId,
        {
            status: MEDICAL_RECORD_STATUS.REVOKED,
            auditLogId,
        },
        { new: true },
    );
};

const update = async (medicalRecordId, record) => {
    return await MedicalRecordModel.updateOne({ _id: medicalRecordId }, { $set: record });
};

export const medicalRecordModel = {
    MEDICAL_RECORD_TYPES,
    MEDICAL_RECORD_STATUS,
    MedicalRecordModel,
    createNew,
    findOneByPatientId,
    revokeRecord,
    findOneById,
    update,
};
