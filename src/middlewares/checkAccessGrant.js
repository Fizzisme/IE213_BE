import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { accessControl } from '~/services/accessControl.service';
import { patientModel } from '~/models/patient.model';

/**
 * Middleware kiểm tra xem doctor có quyền truy cập dữ liệu của patient không
 * Dùng cho các endpoint cần patient-specific access control
 *
 * Cách sử dụng:
 * - Endpoint cần get patientId từ params hoặc query
 * - Nếu không có patientId, middleware sẽ skip
 * - Nếu có patientId, kiểm tra blockchain grant
 *
 * Protected Access Levels:
 * - FULL (2) = mặc định
 * - SENSITIVE (3) = được cấp cho các operation nhạy cảm
 */

const checkAccessGrant = async (req, res, next) => {
    try {
        const currentUser = req.user; // từ verifyToken middleware

        // Lấy patientId từ nhiều nơi có thể
        let patientId = req.params.patientId || req.query.patientId;

        // Nếu từ medicalRecord, cần resolve patientId trước
        if (!patientId && req.params.medicalRecordId) {
            // Sẽ xử lý ở controller, không middleware
            return next();
        }

        // Nếu không có patientId → skip
        if (!patientId) {
            return next();
        }

        // Lấy thông tin patient
        const patient = await patientModel.findById(patientId);
        if (!patient) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Patient not found');
        }

        // Lấy patient user để có walletAddress
        const { userModel } = await import('~/models/user.model');
        const patientUser = await userModel.findById(patient.userId);
        if (!patientUser || !patientUser.walletAddress) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Patient wallet not configured');
        }

        // Kiểm tra blockchain grant (minimum FULL level = 2)
        const hasAccess = await accessControl.checkAccessLevelFromBlockchain(
            patientUser.walletAddress,
            currentUser.walletAddress,
            2  // FULL minimum
        );

        if (!hasAccess) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                'You do not have access to this patient data'
            );
        }

        // Lưu thông tin để controller sử dụng
        req.grantedPatients = req.grantedPatients || [];
        req.grantedPatients.push(patientId);

        next();
    } catch (err) {
        next(err);
    }
};

export default checkAccessGrant;
