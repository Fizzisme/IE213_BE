import { z } from 'zod';

const MEDICAL_RECORD_COLLECTION_NAME = 'medical_records';
const MEDICAL_RECORD_COLLECTION_SCHEMA = z.object({
    patientId: z.string(),
    // doctorId
    doctorId: z.string(),
    // doctorId input
    createdBy: z.string(),
    type: z.string(),
    refId: z.string(),
    createdAt: z.date(),
});
