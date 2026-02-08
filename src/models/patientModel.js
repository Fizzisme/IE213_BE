import { z } from 'zod';

// patient collection
const PATIENT_COLLECTION_NAME = 'patients';
// patient schema
const PATIENT_COLLECTION_SCHEMA = z.object({
    userId: z.string(),

    fullName: z.string().min(2),

    gender: z.enum(['M', 'F']),
    birthYear: z
        .number()
        .int()
        .min(1900)
        .max(new Date().getFullYear()),

    phoneEncrypted: z.string().optional(),
    emailEncrypted: z.string().optional(),

    status: z.enum(['ACTIVE', 'INACTIVE', 'DECEASED']).default('ACTIVE'),

    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z
        .date()
        .nullable()
        .optional(),
});
