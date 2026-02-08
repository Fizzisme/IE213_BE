import { z } from 'zod';

const HIV_TEST_COLLECTION_NAME = 'hiv_tests';
const HIV_TEST_COLLECTION_SCHEMA = z.object({
    patientId: z.string(),
    doctorId: z.string(),
    medicalRecordId: z.string(),
    age: z
        .number()
        .int()
        .min(1),
    wtkg: z.number(),
    gender: z.enum(['M', 'F']),
    karnof: z.number(),
    symptom: z.boolean(),
    cd40: z.number(),
    cd420: z.number(),
    cd80: z.number(),
    cd820: z.number(),
    preanti: z.boolean(),
    offtrt: z.boolean(),
    oprior: z.boolean(),
    z30: z.boolean(),
    trt: z
        .number()
        .int()
        .min(1)
        .max(4),
    strat: z
        .number()
        .int()
        .min(1)
        .max(3),
    infected: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
