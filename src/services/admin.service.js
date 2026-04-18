// ═════════════════════════════════════════════════════════════════════════════════
// ADMIN SERVICE - PRIVILEGED OPERATIONS ONLY
// ═════════════════════════════════════════════════════════════════════════════════
// 
// This service handles ADMIN-ONLY privileged operations:
// ✅ createDoctor - Admin directly creates doctor accounts (no PENDING approval)
// ✅ createLabTech - Admin directly creates lab tech accounts (no PENDING approval)
// ✅ registerPatientBlockchain - Admin registers patients on blockchain
//
// NOTE: User management functions (approve, reject, verify, soft-delete) are in
// adminUserService.js - this follows separation of concerns principle
// ═════════════════════════════════════════════════════════════════════════════════

import { userModel } from '~/models/user.model';
import { auditLogModel } from '~/models/auditLog.model';
import { StatusCodes } from 'http-status-codes';
import { doctorModel } from '~/models/doctor.model';
import { labTechModel } from '~/models/labTech.model';
import bcrypt from 'bcrypt';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';

/**
 * createDoctor - Admin tạo Doctor (Direct)
 * Creates doctor account directly with ACTIVE status (no PENDING approval)
 */
const createDoctor = async ({ email, password, nationId, walletAddress, adminId }) => {
    // Kiểm tra email đã tồn tại
    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false
    });
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại');
    }

    // Tạo user với role DOCTOR + status ACTIVE
    const authProviders = [
        {
            type: 'LOCAL',
            email: email,
            passwordHash: bcrypt.hashSync(password, 8),
            nationId: nationId,
        },
    ];

    if (walletAddress) {
        authProviders.push({
            type: 'WALLET',
            walletAddress: walletAddress,
        });
    }

    const newUser = await userModel.createNew({
        email: email,
        authProviders: authProviders,
        role: userModel.USER_ROLES.DOCTOR,
        status: userModel.USER_STATUS.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId,
    });

    // Gọi addDoctor() on-chain - Optional, không fail request nếu blockchain call fail
    if (walletAddress) {
        try {
            const tx = await blockchainContracts.admin.accountManager.addDoctor(walletAddress);
            await tx.wait();
            console.log('✅ Blockchain addDoctor success:', tx.hash);
        } catch (blockchainError) {
            // Log warning nhưng không throw error - user vẫn được tạo
            console.warn('⚠️ Blockchain addDoctor warning:', blockchainError.message);
        }
    }

    // Tạo doctor profile
    const doctorData = await doctorModel.DoctorModel.create({
        userId: newUser._id,
        fullName: email.split('@')[0], // Dùng phần trước @ của email làm fullName tạm thời
        email: email,
        specialization: 'General',
        licenseNumber: '',
        status: 'ACTIVE',
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: newUser._id,
        details: { note: `Admin created DOCTOR account: ${email}`, walletAddress },
    });

    return {
        userId: newUser._id,
        email: email,
        role: userModel.USER_ROLES.DOCTOR,
        status: userModel.USER_STATUS.ACTIVE,
    };
};

// Admin tạo Lab Tech (Direct)
const createLabTech = async ({ email, password, nationId, walletAddress, adminId }) => {
    // Kiểm tra email đã tồn tại
    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false
    });
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại');
    }

    // Tạo user với role LAB_TECH + status ACTIVE
    const authProviders = [
        {
            type: 'LOCAL',
            email: email,
            passwordHash: bcrypt.hashSync(password, 8),
            nationId: nationId,
        },
    ];

    if (walletAddress) {
        authProviders.push({
            type: 'WALLET',
            walletAddress: walletAddress,
        });
    }

    const newUser = await userModel.createNew({
        email: email,
        authProviders: authProviders,
        role: userModel.USER_ROLES.LAB_TECH,
        status: userModel.USER_STATUS.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId,
    });

    // Gọi addLabTech() on-chain - Optional, không fail request nếu blockchain call fail
    if (walletAddress) {
        try {
            const tx = await blockchainContracts.admin.accountManager.addLabTech(walletAddress);
            await tx.wait();
            console.log('✅ Blockchain addLabTech success:', tx.hash);
        } catch (blockchainError) {
            // Log warning nhưng không throw error - user vẫn được tạo
            console.warn('⚠️ Blockchain addLabTech warning:', blockchainError.message);
        }
    }

    // Tạo lab tech profile
    const labTechData = await labTechModel.LabTechModel.create({
        userId: newUser._id,
        fullName: email.split('@')[0], // Dùng phần trước @ của email làm fullName tạm thời
        gender: 'M', // Mặc định, có thể cập nhật sau
        specialization: [],
        department: '',
    });

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: newUser._id,
        details: { note: `Admin created LAB_TECH account: ${email}`, walletAddress },
    });

    return {
        userId: newUser._id,
        email: email,
        role: userModel.USER_ROLES.LAB_TECH,
        status: userModel.USER_STATUS.ACTIVE,
    };
};

// Admin register patient on blockchain
const registerPatientBlockchain = async ({ patientUserId, adminId }) => {
    // Lấy patient user từ DB
    const patientUser = await userModel.findById(patientUserId);
    if (!patientUser) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Patient user không tồn tại');
    }

    // Kiểm tra role
    if (patientUser.role !== userModel.USER_ROLES.PATIENT) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'User này không phải PATIENT');
    }

    // Lấy wallet address (từ authProviders)
    const walletAddress = patientUser.authProviders?.find(p => p.walletAddress)?.walletAddress;
    if (!walletAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Patient không có wallet address');
    }

    // Gọi registerPatient on-chain - Optional, không fail request nếu blockchain call fail
    try {
        const tx = await blockchainContracts.admin.accountManager.registerPatient(walletAddress);
        await tx.wait();
        console.log('✅ Blockchain registerPatient success:', tx.hash);
    } catch (blockchainError) {
        // Log warning nhưng không throw error
        console.warn('⚠️ Blockchain registerPatient warning:', blockchainError.message);
        throw new ApiError(StatusCodes.BAD_REQUEST, `Register patient on blockchain failed: ${blockchainError.message}`);
    }

    // Ghi audit log
    await auditLogModel.createLog({
        userId: adminId,
        action: 'ADMIN_OVERRIDE',
        entityType: 'USER',
        entityId: patientUserId,
        details: { note: `Admin registered patient on blockchain: ${walletAddress}`, walletAddress },
    });

    return {
        message: 'Patient successfully registered on blockchain',
        userId: patientUserId,
        walletAddress: walletAddress,
    };
};

export const adminService = {
    createDoctor,
    createLabTech,
    registerPatientBlockchain,
};
