// src/validations/authValidation
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Tạo Schema register
const registerSchema = z.object({
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ').optional(),
    password: z.string().min(8).optional(),
    email: z.string().regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Email không hợp lệ').optional(),
    walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Địa chỉ ví không hợp lệ'),
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
