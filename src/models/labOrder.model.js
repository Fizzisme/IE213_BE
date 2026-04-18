import mongoose from 'mongoose';

const COLLECTION_NAME = 'lab_orders';

const SAMPLE_STATUS = {
    ORDERED: 'ORDERED',
    CONSENTED: 'CONSENTED',
    IN_PROGRESS: 'IN_PROGRESS',
    RESULT_POSTED: 'RESULT_POSTED',
    DOCTOR_REVIEWED: 'DOCTOR_REVIEWED',
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED',
};

const labOrderSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },
        patientAddress: {
            type: String,
            required: true,
        },
        patientName: {
            type: String,
            required: true,
        },
        patientDOB: {
            type: Number,
            required: true,
        },

        // 🆕 Link back to medical record (for sync diagnosis)
        relatedMedicalRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'medical_records',
        },

        testsRequested: {
            type: [Object],
            required: true,
        },
        priority: String,
        clinicalNote: String,
        sampleType: String,
        diagnosisCode: String,
        diagnosisName: String,
        attachments: [String],
        recordType: {
            type: String,
            enum: ['GENERAL', 'HIV_TEST', 'DIABETES_TEST', 'LAB_RESULT'],
            default: 'LAB_RESULT',
        },
        requiredLevel: {
            type: Number,
            enum: [0, 1, 2, 3],
            description: '0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE',
        },
        sampleStatus: {
            type: String,
            enum: Object.values(SAMPLE_STATUS),
            default: SAMPLE_STATUS.ORDERED,
        },
        blockchainRecordId: String,

        // SOURCE OF TRUTH & SNAPSHOTS
        // ════════════════════════════════════════════════════════════════
        // Blockchain proofs (on-chain hashes) - ABSOLUTE SOURCE OF TRUTH
        orderHash: String,
        labResultHash: String,
        interpretationHash: String,
        txHash: {
            type: String,
            description: 'Blockchain transaction hash (msg.sender embedded - absolute proof)',
        },

        // WALLET SNAPSHOTS (Denormalization for queries & audit trail)
        // Snapshots ≠ Source of Truth:
        // - labTechWalletAddress: Snapshot tại thời điểm post result (lưu để query nhanh)
        // - txHash: On-chain proof (msg.sender trong smart contract - immutable)
        // 
        // Khi cần verify: Compare snapshot ↔ msg.sender từ blockchain
        labTechWalletAddress: {
            type: String,
            index: true,
            description: 'Wallet của lab tech tại thời điểm post result (snapshot for audit/queries)',
        },
        doctorWalletAddress: {
            type: String,
            index: true,
            description: 'Wallet của doctor tại thời điểm interpret result (snapshot)',
        },

        // [Vấn đề 3] Admin/Doctor phân công order cho lab tech
        // assignedLabTech: ObjectId của lab tech được phân công (null nếu chưa assign)
        assignedLabTech: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            default: null,
            index: true,
            description: 'Lab tech được phân công cho order này (được set bởi admin/doctor khi patient consent)',
        },

        // Lab data & interpretation (off-chain storage)
        labResultData: Object,
        labResultNote: String,
        clinicalInterpretation: String,
        recommendation: String,
        confirmedDiagnosis: String,

        // Link to TestResult (AI analysis layer)
        testResultId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'test_results',
            default: null,
        },

        // Creator metadata
        createdBy: String,
        auditLogs: [Object],
    },
    { timestamps: true, versionKey: false }
);

const LabOrderModel = mongoose.model(COLLECTION_NAME, labOrderSchema);

export const labOrderModel = {
    SAMPLE_STATUS,
    LabOrderModel,
};
