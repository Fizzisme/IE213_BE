// src/validations/authValidation
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

const registerSchema = z
    .object({
        phoneNumber: z
            .string()
            .min(8)
            .max(15)
            .optional(),
        nationId: z.string(),

        password: z
            .string()
            .min(6)
            .optional(),

        walletAddress: z
            .string()
            .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address')
            .optional(),

        fullName: z.string().min(2),

        gender: z.enum(['M', 'F']).optional(),
        role: z.string(),
        email: z.string(),

        dob: z.number(),
    })
    .refine(
        (data) => {
            // PHONE login
            if (data.phoneNumber && data.password) return true;

            // WALLET login
            if (data.walletAddress) return true;

            return false;
        },
        {
            message: 'Either phone+password or walletAddress is required',
            path: ['auth'],
        },
    );

export const authValidation = zodValidate(registerSchema);
