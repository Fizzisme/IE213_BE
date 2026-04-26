import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';
import { objectIdRegex } from '~/utils/constants';
import { paramsValidate } from '~/utils/paramsValidate';

// Tạo Schema createPatient
const createPatientSchema = z.object({
    phoneNumber: z
        .string()
        .min(8)
        .max(15)
        .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Số điện thoại không hợp lệ'),

    fullName: z.string().min(2).max(100, 'Tên không dài quá 100 ký tự'),

    gender: z.enum(['M', 'F'], { message: 'Gender phải là M hoặc F' }),

    birthYear: z.number().min(1900).max(new Date().getFullYear(), 'Năm sinh không hợp lệ'),
});

const createPatient = zodValidate(createPatientSchema);

// Schema updatePatient
const updatePatientSchema = z.object({
    fullName: z.string().min(2).max(100, 'Tên không dài quá 100 ký tự').optional(),

    gender: z.enum(['M', 'F'], { message: 'Gender phải là M hoặc F' }).optional(),

    birthYear: z.number().min(1900).max(new Date().getFullYear(), 'Năm sinh không hợp lệ').optional(),

    phoneNumber: z
        .string()
        .min(8)
        .max(15)
        .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Số điện thoại không hợp lệ')
        .optional(),

    avatar: z.string().url('Avatar phải là URL hợp lệ').optional(),
});

const updatePatient = zodValidate(updatePatientSchema);

// Validate params
const patientIdSchema = z.object({
    patientId: z.string().regex(objectIdRegex, 'Invalid ObjectId'),
});

const patientId = paramsValidate(patientIdSchema);

export const patientValidation = {
    createPatient,
    updatePatient,
    patientId,
};
