import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';
import { objectIdRegex } from '~/utils/constants';
import { paramsValidate } from '~/utils/paramsValidate';

// Validate body

const createSchema = z.object({
    type: z.enum(['DIABETES_TEST']),
    note: z
        .string()
        .trim()
        .max(500, 'Ghi chú không dài quá 500 từ')
        .optional(),
});

const diagnosisSchema = z.object({
    testResultId: z.string(),
    note: z
        .string()
        .trim()
        .max(500, 'Ghi chú không dài quá 500 từ')
        .optional(),
    diagnosis: z
        .string()
        .trim()
        .min(1, 'Bắt buộc chuẩn đoán')
        .max(1000, 'Chuẩn đoán quá dài'),
});

const createNew = zodValidate(createSchema);
const diagnosis = zodValidate(diagnosisSchema);

// Validate params

const medicalRecordIdSchema = z.object({
    medicalRecordId: z.string().regex(objectIdRegex, 'Invalid ObjectId'),
});

const medicalRecordId = paramsValidate(medicalRecordIdSchema);

export const medicalRecordValidation = {
    createNew,
    diagnosis,
    medicalRecordId,
};
