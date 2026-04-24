// Controller tạo thông tin bệnh nhân

import { StatusCodes } from 'http-status-codes';
import { patientService } from '~/services/patient.service';
import { appointmentModel } from '~/models/appointment.model';
const createPatient = async (req, res, next) => {
    try {
        const result = await patientService.createPatient(req.user, req.body);
        res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const result = await patientService.getAll();
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

const getPatientById = async (req, res, next) => {
    try {
        const result = await patientService.getPatientById(req.params.patientId);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

const getMyProfile = async (req, res, next) => {
    try {
        const result = await patientService.getMyProfile(req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

export const patientController = { createPatient, getAll, getPatientById, getMyProfile };
