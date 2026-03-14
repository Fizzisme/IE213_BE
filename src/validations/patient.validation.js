import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';
// Tạo Schema createPatient
const createPatientSchema = z.object({
    phoneNumber: z
        .string()
        .min(8)
        .max(15)
        .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Số điện thoại không hợp lệ'),

    fullName: z.string().min(2),

    gender: z.enum(['M', 'F']).optional(),

    dob: z.number(),
});

const createPatient = zodValidate(createPatientSchema);

export const patientValidation = {
    createPatient,
};
