// Controller tạo thông tin bệnh nhân

import { StatusCodes } from 'http-status-codes';
import { patientService } from '~/services/patient.service';
import { appointmentModel } from '~/models/appointment.model';

/**
 * Tạo thông tin bệnh nhân mới
 * - Sử dụng thông tin user hiện tại (req.user)
 * - Dữ liệu chi tiết lấy từ req.body
 */
const createPatient = async (req, res, next) => {
    try {
        // Gọi service để tạo bệnh nhân
        const result = await patientService.createPatient(req.user, req.body);

        // Trả về kết quả với status 201 (Created)
        res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
        // Chuyển lỗi sang middleware xử lý lỗi
        next(err);
    }
};

/**
 * Lấy toàn bộ danh sách bệnh nhân
 */
const getAll = async (req, res, next) => {
    try {
        // Gọi service lấy danh sách bệnh nhân
        const result = await patientService.getAll();

        // Trả về kết quả
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        // Chuyển lỗi sang middleware xử lý lỗi
        next(error);
    }
};

/**
 * Lấy thông tin chi tiết bệnh nhân theo ID
 */
const getPatientById = async (req, res, next) => {
    try {
        // Lấy patientId từ params
        const patientId = req.params.patientId;

        // Gọi service để lấy thông tin
        const result = await patientService.getPatientById(patientId);

        // Trả về kết quả
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        // Chuyển lỗi sang middleware xử lý lỗi
        next(err);
    }
};

/**
 * Lấy thông tin hồ sơ của chính user hiện tại
 */
const getMyProfile = async (req, res, next) => {
    try {
        // Gọi service với user hiện tại
        const result = await patientService.getMyProfile(req.user);

        // Trả về kết quả
        res.status(StatusCodes.OK).json(result);
    } catch (err) {
        // Chuyển lỗi sang middleware xử lý lỗi
        next(err);
    }
};

/**
 * Export controller
 */
export const patientController = {
    createPatient,
    getAll,
    getPatientById,
    getMyProfile
};