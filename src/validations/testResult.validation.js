import z from 'zod';
import { zodValidate } from '~/utils/zodValidate';
// Schema cho xét nghiệm tiểu đường
const createNewSchema = z.object({
    testType: z.enum(['DIABETES_TEST']),
    rawData: z.object({}).passthrough(),
});

const createNew = zodValidate(createNewSchema);

export const testResultValidation = {
    createNew,
};
