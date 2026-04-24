import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Schema cập nhật thông tin y tế bệnh nhân
const updatePatientProfileSchema = z.object({
    fullName: z.string().min(2).optional(),
    phoneNumber: z.string().regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Số điện thoại không hợp lệ').optional(),
    gender: z.enum(['M', 'F']).optional(),
    dob: z.number().optional(), // Unix timestamp (ms)
});

const updatePatientProfile = zodValidate(updatePatientProfileSchema);

export const patientValidation = {
    updatePatientProfile,
};
