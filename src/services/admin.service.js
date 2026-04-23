// ═════════════════════════════════════════════════════════════════════════════════
// ADMIN SERVICE - PRIVILEGED OPERATIONS ONLY
// ═════════════════════════════════════════════════════════════════════════════════
//
// This service handles ADMIN-ONLY privileged operations:
// createDoctor - Admin directly creates doctor accounts (no PENDING approval)
// createLabTech - Admin directly creates lab tech accounts (no PENDING approval)
// NOTE: Patient blockchain self-registration đã chuyển sang patient.service
//
// NOTE: User management functions (approve, reject, verify, soft-delete) are in
// adminUserService.js - this follows separation of concerns principle
// ═════════════════════════════════════════════════════════════════════════════════

import { userModel } from '~/models/user.model'
import { auditLogModel } from '~/models/auditLog.model'
import { StatusCodes } from 'http-status-codes'
import { doctorModel } from '~/models/doctor.model'
import { labTechModel } from '~/models/labTech.model'
import { ethers } from 'ethers'
import bcrypt from 'bcrypt'
import ApiError from '~/utils/ApiError'
import metaMaskTxBuilder from '~/utils/metaMaskTxBuilder'
import { verifyTransactionOnBlockchain } from '~/utils/metaMaskTxBuilder'
import { blockchainContracts } from '~/blockchain/contract'

/**
 * createDoctor - Admin tạo Doctor (Direct)
 * Creates doctor account directly with ACTIVE status (no PENDING approval)
 *
 * FIX: Đổi tên thành _createDoctorInDB để thể hiện đây là hàm nội bộ.
 * Không export — mọi caller từ ngoài phải đi qua confirmCreateDoctor
 * để đảm bảo blockchain đã được verify trước khi ghi DB.
 * Đồng thầm xóa audit log ở đây vì confirmCreateDoctor đã ghi rồi — tránh duplicate.
 */
const _createDoctorInDB = async ({ email, password, nationId, walletAddress, adminId }) => {
    // Kiểm tra email đã tồn tại
    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false
    })
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại')
    }

    if (nationId) {
        const existingNationId = await userModel.findByNationId(nationId)
        if (existingNationId) {
            throw new ApiError(StatusCodes.CONFLICT, 'NationId đã tồn tại')
        }
    }

    // Tạo user với role DOCTOR + status ACTIVE
    const authProviders = [
        {
            type: 'LOCAL',
            email: email,
            passwordHash: bcrypt.hashSync(password, 8),
            nationId: nationId
        }
    ]

    if (walletAddress) {
        authProviders.push({
            type: 'WALLET',
            walletAddress: walletAddress
        })
    }

    const newUser = await userModel.createNew({
        email: email,
        authProviders: authProviders,
        role: userModel.USER_ROLES.DOCTOR,
        status: userModel.USER_STATUS.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId
    })

    // SECURITY: Blockchain addDoctor call removed - no admin private key used at runtime
    // For doctor blockchain registration, use one of:
    // 1. Deployment script: scripts/deploy-roles.js
    // 2. Admin MetaMask signing (prepare/confirm pattern - to be implemented)
    // 3. Skip blockchain registration (off-chain only)
    console.log('[INFO] Doctor registered off-chain. For blockchain registration, use deployment script or admin MetaMask.')

    // Tạo doctor profile
    const doctorData = await doctorModel.DoctorModel.create({
        userId: newUser._id,
        fullName: email.split('@')[0], // Dùng phần trước @ của email làm fullName tạm thởi
        email: email,
        specialization: 'General',
        licenseNumber: '',
        status: 'ACTIVE'
    })

    return {
        userId: newUser._id,
        email: email,
        role: userModel.USER_ROLES.DOCTOR,
        status: userModel.USER_STATUS.ACTIVE
    }
}

// Admin tạo Lab Tech (Direct)
// FIX: Đổi tên thành _createLabTechInDB để thể hiện đây là hàm nội bộ.
// Không export — mọi caller từ ngoài phải đi qua confirmCreateLabTech
// để đảm bảo blockchain đã được verify trước khi ghi DB.
// Đồng thầm xóa audit log ở đây vì confirmCreateLabTech đã ghi rồi — tránh duplicate.
const _createLabTechInDB = async ({ email, password, nationId, walletAddress, adminId }) => {
    // Kiểm tra email đã tồn tại
    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false
    })
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại')
    }

    if (nationId) {
        const existingNationId = await userModel.findByNationId(nationId)
        if (existingNationId) {
            throw new ApiError(StatusCodes.CONFLICT, 'NationId đã tồn tại')
        }
    }

    // Tạo user với role LAB_TECH + status ACTIVE
    const authProviders = [
        {
            type: 'LOCAL',
            email: email,
            passwordHash: bcrypt.hashSync(password, 8),
            nationId: nationId
        }
    ]

    if (walletAddress) {
        authProviders.push({
            type: 'WALLET',
            walletAddress: walletAddress
        })
    }

    const newUser = await userModel.createNew({
        email: email,
        authProviders: authProviders,
        role: userModel.USER_ROLES.LAB_TECH,
        status: userModel.USER_STATUS.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId
    })

    // SECURITY: Blockchain addLabTech call removed - no admin private key used at runtime
    // For lab tech blockchain registration, use one of:
    // 1. Deployment script: scripts/deploy-roles.js
    // 2. Admin MetaMask signing (prepare/confirm pattern - to be implemented)
    // 3. Skip blockchain registration (off-chain only)
    console.log('[INFO] Lab Tech registered off-chain. For blockchain registration, use deployment script or admin MetaMask.')

    // Tạo lab tech profile
    const labTechData = await labTechModel.LabTechModel.create({
        userId: newUser._id,
        fullName: email.split('@')[0], // Dùng phần trước @ của email làm fullName tạm thời
        gender: 'M', // Mặc định, có thể cập nhật sau
        specialization: [],
        department: ''
    })

    return {
        userId: newUser._id,
        email: email,
        role: userModel.USER_ROLES.LAB_TECH,
        status: userModel.USER_STATUS.ACTIVE
    }
}

// Patient blockchain registration flow không còn nằm ở admin service.

const toHexChainId = (chainId) => `0x${Number(chainId).toString(16)}`

const buildPrepareResponse = (action, preparedTx, details = {}) => {
    const { unsignedTx, chainId, functionSignature } = preparedTx

    return {
        message: 'Chuẩn bị giao dịch thành công. Hãy ký bằng ví frontend (MetaMask).',
        action,
        txRequest: {
            to: unsignedTx.to,
            data: unsignedTx.data,
            value: unsignedTx.value || '0',
            chainId: toHexChainId(chainId),
        },
        suggestedTx: {
            from: unsignedTx.from,
            gasLimit: unsignedTx.gasLimit,
            gasPrice: unsignedTx.gasPrice,
            nonce: unsignedTx.nonce,
        },
        details: {
            functionSignature,
            chainId: Number(chainId),
            ...details,
        },
    }
}

const verifyConfirmedTxByUser = async (walletAddress, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận giao dịch')
    }

    const verification = await verifyTransactionOnBlockchain(txHash)
    if (!verification.found) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy giao dịch trên blockchain')
    }
    if (!verification.confirmed) {
        throw new ApiError(StatusCodes.CONFLICT, 'Giao dịch chưa được xác nhận trên blockchain')
    }
    if (verification.status !== 'SUCCESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại trên blockchain')
    }

    if (!verification.from || verification.from.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Giao dịch không thuộc về wallet hiện tại. tx.from=${verification.from}, wallet=${walletAddress}`
        )
    }

    return verification
}

const verifyTxFunctionCall = async ({ txHash, contract, functionName, argsValidator }) => {
    const tx = await blockchainContracts.provider.getTransaction(txHash)
    if (!tx) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy transaction data')
    }

    if (!tx.to || tx.to.toLowerCase() !== contract.target.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch không gửi tới contract đích')
    }

    const parsed = contract.interface.parseTransaction({
        data: tx.data,
        value: tx.value,
    })

    if (!parsed || parsed.name !== functionName) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch không gọi đúng hàm ${functionName}`)
    }

    if (typeof argsValidator === 'function') {
        const validArgs = argsValidator(parsed.args)
        if (!validArgs) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Args không khớp cho hàm ${functionName}`)
        }
    }
}

const prepareCreateDoctor = async ({ adminWalletAddress, email, password, nationId, walletAddress }) => {
    if (!adminWalletAddress || !ethers.isAddress(adminWalletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Admin walletAddress không hợp lệ')
    }

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'walletAddress của doctor không hợp lệ')
    }

    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false,
    })
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại')
    }

    const preparedTx = await metaMaskTxBuilder.prepareAddDoctorTx(adminWalletAddress, walletAddress)

    return buildPrepareResponse('ADMIN_ADD_DOCTOR', preparedTx, {
        email,
        nationId,
        walletAddress,
    })
}

const confirmCreateDoctor = async ({ currentUser, txHash, email, password, nationId, walletAddress }) => {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'walletAddress của doctor không hợp lệ')
    }

    await verifyConfirmedTxByUser(currentUser.walletAddress, txHash)

    await verifyTxFunctionCall({
        txHash,
        contract: blockchainContracts.read.accountManager,
        functionName: 'addDoctor',
        argsValidator: (args) => args?.[0]?.toLowerCase() === walletAddress.toLowerCase(),
    })

    // FIX: Gọi _createDoctorInDB thay vì createDoctor (đã đổi tên)
    const result = await _createDoctorInDB({
        email,
        password,
        nationId,
        walletAddress,
        adminId: currentUser._id,
    })

    // FIX: Wrap try/catch — audit log không được làm fail cả request
    // Đây là audit log duy nhất cho action này (_createDoctorInDB không còn ghi nữa)
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'ADMIN_ADD_DOCTOR_BLOCKCHAIN',
            entityType: 'USER',
            entityId: result.userId,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Admin confirmed addDoctor on blockchain for ${walletAddress}`,
                walletAddress,
                email,
            },
        })
    } catch (auditError) {
        console.error('[Admin] Audit log failed (non-blocking):', auditError.message)
    }

    return {
        message: 'Doctor account created successfully',
        txHash,
        data: result,
    }
}

const prepareCreateLabTech = async ({ adminWalletAddress, email, password, nationId, walletAddress }) => {
    if (!adminWalletAddress || !ethers.isAddress(adminWalletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Admin walletAddress không hợp lệ')
    }

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'walletAddress của lab tech không hợp lệ')
    }

    const existingUser = await userModel.UserModel.findOne({
        'authProviders.email': email,
        _destroy: false,
    })
    if (existingUser) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại')
    }

    const preparedTx = await metaMaskTxBuilder.prepareAddLabTechTx(adminWalletAddress, walletAddress)

    return buildPrepareResponse('ADMIN_ADD_LABTECH', preparedTx, {
        email,
        nationId,
        walletAddress,
    })
}

const confirmCreateLabTech = async ({ currentUser, txHash, email, password, nationId, walletAddress }) => {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'walletAddress của lab tech không hợp lệ')
    }

    await verifyConfirmedTxByUser(currentUser.walletAddress, txHash)

    await verifyTxFunctionCall({
        txHash,
        contract: blockchainContracts.read.accountManager,
        functionName: 'addLabTech',
        argsValidator: (args) => args?.[0]?.toLowerCase() === walletAddress.toLowerCase(),
    })

    // FIX: Gọi _createLabTechInDB thay vì createLabTech (đã đổi tên)
    const result = await _createLabTechInDB({
        email,
        password,
        nationId,
        walletAddress,
        adminId: currentUser._id,
    })

    // FIX: Wrap try/catch — audit log không được làm fail cả request
    // Đây là audit log duy nhất cho action này (_createLabTechInDB không còn ghi nữa)
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: currentUser.walletAddress,
            action: 'ADMIN_ADD_LABTECH_BLOCKCHAIN',
            entityType: 'USER',
            entityId: result.userId,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Admin confirmed addLabTech on blockchain for ${walletAddress}`,
                walletAddress,
                email,
            },
        })
    } catch (auditError) {
        console.error('[Admin] Audit log failed (non-blocking):', auditError.message)
    }

    return {
        message: 'Lab tech account created successfully',
        txHash,
        data: result,
    }
}

// FIX: Chỉ export public API cho admin operations
export const adminService = {
    prepareCreateDoctor,
    confirmCreateDoctor,
    prepareCreateLabTech,
    confirmCreateLabTech,
}