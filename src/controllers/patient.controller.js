// Controller tạo thông tin bệnh nhân

import { StatusCodes } from 'http-status-codes';
import { patientService } from '~/services/patient.service';

const createPatient = async (req, res, next) => {
    try {
        const result = await patientService.createPatient(req.user, req.body);
        res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
        next(err);
    }
};

export const patientController = { createPatient };
