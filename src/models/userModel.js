import { z } from 'zod';

// create array of auth provider
const AuthProviderSchema = z.object({
    type: z.enum(['PHONE', 'WALLET']),
    phoneHash: z.string().optional(),
    passwordHash: z.string().optional(),
    walletAddress: z.string().optional(),
});

// user collection
const USER_COLLECTION_NAME = 'users';
// user schema
const USER_COLLECTION_SCHEMA = z.object({
    authProviders: z.array(AuthProviderSchema).min(1),
    role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']),
    status: z.enum(['ACTIVE', 'BLOCKED']),
    createdAt: z.date(),
    updatedAt: z.date(),
    _destroy: z.boolean().default(false),
});

//index
db.users.createIndex({ 'authProviders.phoneHash': 1 }, { unique: true, sparse: true });

db.users.createIndex({ 'authProviders.walletAddress': 1 }, { unique: true, sparse: true });
