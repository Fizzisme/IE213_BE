import { z } from 'zod';

// doctor collection
const DOCTOR_COLLECTION_NAME = 'doctors';
// doctor schema
const DOCTOR_COLLECTION_SCHEMA = z.object({
    userId: z.string(),
    fullName: z.string().min(2),

    specialization: z.string(),
    hospital: z.string().optional(),

    licenseNumber: z.string().optional(),
    phoneEncrypted: z.string().optional(),
    email: z
        .string()
        .email()
        .optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z
        .date()
        .nullable()
        .optional(),
});
