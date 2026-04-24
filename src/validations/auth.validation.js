// src/validations/authValidation
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Tạo Schema loginByNationId
const loginByNationIdSchema = z.object({
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),
    password: z.string().min(8),
});

// Trả về các hàm
const loginByNationId = zodValidate(loginByNationIdSchema);

export const authValidation = {
    loginByNationId,
};
