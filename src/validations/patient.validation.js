import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Patient profile ONLY includes: gender, birthYear
// fullName, phoneNumber are in User model
const createPatientSchema = z.object({
    gender: z.enum(['M', 'F']),
    dob: z.number(),
});

const createPatient = zodValidate(createPatientSchema);

export const patientValidation = {
    createPatient,
};
