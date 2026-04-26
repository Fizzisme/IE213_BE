import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';
import { objectIdRegex } from '~/utils/constants';
import { paramsValidate } from '~/utils/paramsValidate';

// Validate body cho việc tạo mới
const createSchema = z.object({
    type: z.string().min(1, 'Loại bệnh án là bắt buộc'), 
    note: z.string().trim().max(500, 'Ghi chú không dài quá 500 từ').optional(),
});

// Validate body cho việc chẩn đoán
const diagnosisSchema = z.object({
    testResultId: z.string().regex(objectIdRegex, 'Mã kết quả xét nghiệm không hợp lệ'),
    note: z.string().trim().max(500, 'Ghi chú không dài quá 500 từ').optional(),
    diagnosis: z.string().trim().min(1, 'Bắt buộc chuẩn đoán').max(1000, 'Chuẩn đoán quá dài'),
});

const createNew = zodValidate(createSchema);
const diagnosis = zodValidate(diagnosisSchema);

// Validate params
const medicalRecordIdSchema = z.object({
    medicalRecordId: z.string().regex(objectIdRegex, 'Mã hồ sơ không hợp lệ'),
});

const patientIdSchema = z.object({
    patientId: z.string().regex(objectIdRegex, 'Mã bệnh nhân không hợp lệ'),
});

const medicalRecordId = paramsValidate(medicalRecordIdSchema);
const patientId = paramsValidate(patientIdSchema);

export const medicalRecordValidation = {
    createNew,
    diagnosis,
    medicalRecordId,
    patientId,
};
