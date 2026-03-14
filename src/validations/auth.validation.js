// src/validations/authValidation
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Tạo Schema register
const registerSchema = z.object({
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),

    password: z.string().min(8),

    email: z.string().regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Email không hợp lệ'),
});
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
// Tạo Schema loginByNationId
const loginByNationIdSchema = z.object({
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),
    password: z.string().min(8),
});

// Trả về các hàm
const register = zodValidate(registerSchema);

const loginByNationId = zodValidate(loginByNationIdSchema);

const createPatient = zodValidate(createPatientSchema);

export const authValidation = {
    register,
    loginByNationId,
    createPatient,
};
