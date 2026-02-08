import { z } from 'zod';

const DetailSchema = z.object({
    ip: z.string().optional(),
    device: z.string().optional(),
    recordId: z.string().optional(),
});

const AUDIT_LOG_COLLECTION_NAME = 'audit_logs';

const AUDIT_LOG_COLLECTION_SCHEMA = z.object({
    userId: z.string().optional(),
    walletAddress: z.string().optional(),

    action: z.enum(['LOGIN_PHONE', 'LOGIN_WALLET', 'CREATE_HIV_TEST', 'SUBMIT_HIV_TEST']),

    entityType: z.enum(['HIV_TEST', 'MEDICAL_RECORD']).optional(),
    entityId: z.string().optional(),

    txHash: z.string().optional(),
    chainId: z.number().optional(),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).default('PENDING'),
    errorMessage: z.string().optional(),

    details: DetailSchema.optional(),

    createdAt: z.date(),
});
