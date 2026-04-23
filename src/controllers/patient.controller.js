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

const getMyLabOrders = async (req, res, next) => {
    try {
        const result = await patientService.getMyLabOrders(req.user, req.query);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

const getMyMedicalRecords = async (req, res, next) => {
    try {
        const result = await patientService.getMyMedicalRecords(req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        next(err);
    }
};

const prepareRegisterBlockchain = async (req, res, next) => {
    try {
        const result = await patientService.prepareRegisterBlockchain(req.user);
        res.status(StatusCodes.OK).json({
            statusCode: StatusCodes.OK,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const confirmRegisterBlockchain = async (req, res, next) => {
    try {
        const result = await patientService.confirmRegisterBlockchain(req.user, req.body.txHash);
        res.status(StatusCodes.OK).json({
            statusCode: StatusCodes.OK,
            message: result.message,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

export const patientController = {
    createPatient,
    getAll,
    getPatientById,
    getMyProfile,
    getMyLabOrders,
    getMyMedicalRecords,
    prepareRegisterBlockchain,
    confirmRegisterBlockchain,
};
