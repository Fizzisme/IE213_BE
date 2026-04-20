// src/services/user.service.js
import { userModel } from '~/models/user.model';
import { doctorModel } from '~/models/doctor.model';
import { patientModel } from '~/models/patient.model';
import { labTechModel } from '~/models/labTech.model';
import ApiError from '~/utils/ApiError';
import { StatusCodes } from 'http-status-codes';

/**
 * Get current user profile with role-specific merge
 * GET /v1/users/me endpoint
 * 
 * Returns:
 * {
 *   id, role, email, walletAddress, status, 
 *   fullName, phone, avatar,
 *   profile: { // Role-specific data
 *     specialization (doctor),
 *     gender, birthYear (patient),
 *     licenseNumber (labTech),
 *     ...
 *   }
 * }
 */
const getMyProfile = async (userId) => {
    if (!userId) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
    }

    // Get user base info
    const user = await userModel.findById(userId);
    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
    }

    if (user._destroy) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Account has been deleted');
    }

    // Extract auth info
    const localAuth = user.authProviders.find((p) => p.type === 'LOCAL');
    const walletAuth = user.authProviders.find((p) => p.type === 'WALLET');

    // Build base response
    const userResponse = {
        id: user._id,
        role: user.role,
        status: user.status,
        email: localAuth?.email || null,
        nationId: localAuth?.nationId || null,
        walletAddress: walletAuth?.walletAddress || null,
        fullName: user.fullName,
        phone: user.phone,
        avatar: user.avatar,
        hasProfile: user.hasProfile,
        createdAt: user.createdAt,
    };

    // Get role-specific profile
    let roleProfile = null;

    try {
        switch (user.role) {
            case userModel.USER_ROLES.DOCTOR: {
                roleProfile = await doctorModel.DoctorModel.findOne({ userId }, {
                    specialization: 1,
                    hospital: 1,
                    licenseNumber: 1,
                    status: 1,
                }).lean();
                break;
            }
            case userModel.USER_ROLES.PATIENT: {
                roleProfile = await patientModel.PatientModel.findOne({ userId }, {
                    gender: 1,
                    birthYear: 1,
                }).lean();
                break;
            }
            case userModel.USER_ROLES.LAB_TECH: {
                roleProfile = await labTechModel.LabTechModel.findOne({ userId }, {
                    licenseNumber: 1,
                    certifications: 1,
                    status: 1,
                }).lean();
                break;
            }
            // ADMIN doesn't need additional profile
            default:
                break;
        }
    } catch (err) {
        // If profile fetch fails, just return user info without profile
        console.warn(`[getMyProfile] Failed to fetch ${user.role} profile:`, err.message);
    }

    return {
        ...userResponse,
        profile: roleProfile || null,
    };
};

/**
 * Update user basic profile (name, phone, avatar)
 * PATCH /v1/users/me endpoint
 */
const updateMyProfile = async (userId, updateData) => {
    if (!userId) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
    }

    // Only allow updating these fields
    const allowedFields = ['fullName', 'phone', 'avatar'];
    const updatePayload = {};

    for (const field of allowedFields) {
        if (field in updateData) {
            updatePayload[field] = updateData[field];
        }
    }

    const updated = await userModel.updateById(userId, updatePayload);

    if (!updated) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
    }

    return await getMyProfile(userId);
};

/**
 * Change password for LOCAL auth users
 * PATCH /v1/users/me/password endpoint
 */
const changePassword = async (userId, oldPassword, newPassword) => {
    if (!userId) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
    }

    const user = await userModel.findById(userId);
    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
    }

    // Find LOCAL auth provider
    const localAuth = user.authProviders.find((p) => p.type === 'LOCAL');
    if (!localAuth) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'This account uses wallet authentication. Password change is not supported.'
        );
    }

    // Verify old password
    const bcrypt = (await import('bcrypt')).default;
    const isMatch = bcrypt.compareSync(oldPassword, localAuth.passwordHash);
    if (!isMatch) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Current password is incorrect');
    }

    // Check that new password != old password
    if (oldPassword === newPassword) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'New password must be different from current password'
        );
    }

    // Validate new password format (same as register validation)
    if (!newPassword || newPassword.length < 8) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'New password must be at least 8 characters long'
        );
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 8);

    // Update password in authProviders
    user.authProviders[user.authProviders.indexOf(localAuth)].passwordHash = hashedPassword;
    await user.save();

    return { message: 'Password changed successfully' };
};

export const userService = {
    getMyProfile,
    updateMyProfile,
    changePassword,
};
