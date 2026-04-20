import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

const adminLoginSchema = z.object({
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),
    password: z.string().min(8),
});

const login = zodValidate(adminLoginSchema);

export const adminAuthValidation = {
    login,
};