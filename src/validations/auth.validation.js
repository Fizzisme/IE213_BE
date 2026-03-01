// src/validations/authValidation
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Tạo Schema register
const registerSchema = z.object({
    phoneNumber: z
        .string()
        .min(8)
        .max(15)
        .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Số điện thoại không hợp lệ'),
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),

    password: z.string().min(8),

    fullName: z.string().min(2),

    gender: z.enum(['M', 'F']).optional(),
    role: z.string().optional(),
    email: z.string().regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Email không hợp lệ'),

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

export const authValidation = {
    register,
    loginByNationId,
};
