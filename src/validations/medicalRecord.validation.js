import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';
import { objectIdRegex } from '~/utils/constants';
import { paramsValidate } from '~/utils/paramsValidate';

// Validate body

const createSchema = z.object({
    chief_complaint: z
        .string()
        .trim()
        .min(5, 'Triệu chứng chính phải ít nhất 5 ký tự')
        .max(1000, 'Triệu chứng chính không dài quá 1000 ký tự'),
    // FLEXIBLE VITAL SIGNS - Accept any object with vital signs (REQUIRED)
    // Examples: {temperature: 37.5, blood_pressure: "120/80", heart_rate: 72, SpO2: 98}
    vital_signs: z.record(z.string(), z.unknown()),

    // FLEXIBLE PHYSICAL EXAM - Accept any object with exam findings
    // Examples: {chest: "Clear", abdomen: "Soft", ...}
    physical_exam: z.record(z.string(), z.unknown()).optional(),

    assessment: z
        .string()
        .trim()
        .max(1000, 'Đánh giá không dài quá 1000 ký tự')
        .optional(),
    plan: z
        .array(z.string())
        .optional(),
    // 🆕 Initial diagnosis based on physical exam (optional - doctor can add or skip)
    diagnosis: z
        .string()
        .trim()
        .min(5, 'Chẩn đoán phải ít nhất 5 ký tự')
        .max(1000, 'Chẩn đoán không dài quá 1000 ký tự')
        .optional(),
});

const createNew = zodValidate(createSchema);

// Validate params

const medicalRecordIdSchema = z.object({
    medicalRecordId: z.string().regex(objectIdRegex, 'Invalid ObjectId'),
});

const medicalRecordId = paramsValidate(medicalRecordIdSchema);

export const medicalRecordValidation = {
    createNew,
    medicalRecordId,
};
