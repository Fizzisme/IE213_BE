import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Patient profile ONLY includes: gender, birthYear
// fullName, phoneNumber are in User model
const createPatientSchema = z.object({
    gender: z.enum(['M', 'F']),
    dob: z.number(),
});

const createPatient = zodValidate(createPatientSchema);
const confirmRegisterBlockchainSchema = z.object({
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash không hợp lệ'),
});
const confirmRegisterBlockchain = zodValidate(confirmRegisterBlockchainSchema);

export const patientValidation = {
    createPatient,
    confirmRegisterBlockchain,
};
