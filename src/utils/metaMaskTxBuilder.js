/**
 * metaMaskTxBuilder.js
 *
 * Mục đích: Chuẩn bị unsigned transactions để frontend ký với MetaMask.
 * - Không dùng private key ở đây.
 * - Chỉ encode contract calls + tính nonce/gas.
 * - Trả unsigned tx data để frontend ký, sau đó gọi confirm* API.
 *
 * Thay đổi so với phiên bản cũ (V4 - fix all bugs):
 * [Fix #1] export const verifyTransactionOnBlockchain — thiếu export khiến tất cả confirm* crash
 * [Fix #2] prepareCompleteTx: COMPLETE = 5 (không phải 8)
 * [Fix #3] preparePostResultTx: bỏ labResultIpfsHash (contract V4 không còn tham số này)
 * [Fix #4] prepareInterpretationTx: bỏ interpretationIpfsHash (contract V4)
 * [Fix #5] prepareAddRecordTx: bỏ orderIpfsHash (contract V4)
 * [Fix #6] prepareRegisterPatientTx: registerPatient() không nhận tham số nào
 */

import { ethers } from 'ethers'
import { provider } from '~/blockchain/provider'
import { blockchainContracts } from '~/blockchain/contract'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

// ============================================================================
// HELPER NỘI BỘ
// ============================================================================

const DEFAULT_GAS_LIMIT = 300000

/**
 * buildUnsignedTx
 * - Helper dùng chung để tránh lặp code lấy nonce/network/feeData.
 * - Trả về object unsigned tx chuẩn để MetaMask ký.
 */
const buildUnsignedTx = async (fromAddress, toAddress, encodedData) => {
    const [nonce, network, feeData] = await Promise.all([
        provider.getTransactionCount(fromAddress, 'pending'),
        provider.getNetwork(),
        provider.getFeeData(),
    ])

    return {
        unsignedTx: {
            to: toAddress,
            from: fromAddress,
            data: encodedData,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        },
        nonce,
        chainId: network.chainId,
    }
}

// ============================================================================
// PATIENT OPERATIONS
// ============================================================================

/**
 * prepareConsentTx
 * Bệnh nhân xác nhận đồng ý với lab order.
 * Contract: EHRManager.updateRecordStatus(recordId, 1) — CONSENTED = 1
 */
export const prepareConsentTx = async (patientAddress, recordId) => {
    try {
        if (!ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ bệnh nhân không hợp lệ')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        const encodedData = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            1, // CONSENTED
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            patientAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[prepareConsentTx] recordId=${recordId}, patient=${patientAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus: 1,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareGrantAccessTx
 * Bệnh nhân cấp quyền truy cập cho bác sĩ/lab tech.
 * Contract: AccessControl.grantAccess(accessor, level, durationHours)
 */
export const prepareGrantAccessTx = async (patientAddress, accessorAddress, level, durationHours = 0) => {
    try {
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accessControl = blockchainContracts.read.accessControl
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo')
        }

        // SENSITIVE = 3, FULL = 2 (khớp enum trong AccessControl.sol)
        const accessLevel = level === 'SENSITIVE' ? 3 : 2

        const encodedData = accessControl.interface.encodeFunctionData('grantAccess', [
            accessorAddress,
            accessLevel,
            BigInt(durationHours),
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            patientAddress,
            accessControl.target,
            encodedData,
        )

        console.log(`[prepareGrantAccessTx] accessor=${accessorAddress}, level=${level}(${accessLevel})`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accessControl.target,
            functionSignature: 'grantAccess(address,uint8,uint64)',
            accessorAddress,
            accessLevel,
            durationHours,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareRevokeAccessTx
 * Bệnh nhân thu hồi quyền truy cập.
 * Contract: AccessControl.revokeAccess(accessor)
 */
export const prepareRevokeAccessTx = async (patientAddress, accessorAddress) => {
    try {
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accessControl = blockchainContracts.read.accessControl
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo')
        }

        const encodedData = accessControl.interface.encodeFunctionData('revokeAccess', [
            accessorAddress,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            patientAddress,
            accessControl.target,
            encodedData,
        )

        console.log(`[prepareRevokeAccessTx] accessor=${accessorAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accessControl.target,
            functionSignature: 'revokeAccess(address)',
            accessorAddress,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareUpdateAccessTx
 * Bệnh nhân cập nhật quyền truy cập hiện tại.
 * Contract: AccessControl.updateAccess(accessor, level, durationHours)
 */
export const prepareUpdateAccessTx = async (patientAddress, accessorAddress, level, durationHours = 0) => {
    try {
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accessControl = blockchainContracts.read.accessControl
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo')
        }

        const accessLevel = level === 'SENSITIVE' ? 3 : 2

        const encodedData = accessControl.interface.encodeFunctionData('updateAccess', [
            accessorAddress,
            accessLevel,
            BigInt(durationHours),
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            patientAddress,
            accessControl.target,
            encodedData,
        )

        console.log(`[prepareUpdateAccessTx] accessor=${accessorAddress}, level=${level}(${accessLevel})`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accessControl.target,
            functionSignature: 'updateAccess(address,uint8,uint64)',
            accessorAddress,
            accessLevel,
            durationHours,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}
// DOCTOR OPERATIONS
// ============================================================================

/**
 * prepareAddRecordTx
 * Bác sĩ tạo lab order mới.
 * Contract: addRecord(patient, recordType, requiredLevel, orderHash, orderIpfsHash, assignedLabTech)
 */
export const prepareAddRecordTx = async (
    doctorAddress,
    patientAddress,
    recordTypeNum,
    requiredLevel,
    orderHash,
    orderIpfsHash = '',
    assignedLabTech,
) => {
    try {
        if (!ethers.isAddress(doctorAddress) || !ethers.isAddress(patientAddress) || !ethers.isAddress(assignedLabTech)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }
        if (!orderHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu orderHash')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        // Contract: addRecord(address,uint8,uint8,bytes32,string,address)
        const encodedData = ehrManager.interface.encodeFunctionData('addRecord', [
            patientAddress,
            recordTypeNum,
            requiredLevel,
            orderHash,
            orderIpfsHash,
            assignedLabTech,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            doctorAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[prepareAddRecordTx] patient=${patientAddress}, type=${recordTypeNum}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'addRecord(address,uint8,uint8,bytes32,string,address)',
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareInterpretationTx
 * Bác sĩ thêm diễn giải lâm sàng.
 * Contract: addClinicalInterpretation(recordId, interpretationHash, interpretationIpfsHash)
 */
export const prepareInterpretationTx = async (doctorAddress, recordId, interpretationHash, interpretationIpfsHash) => {

    try {
        if (!ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ bác sĩ không hợp lệ')
        }
        if (!interpretationHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu interpretationHash')
        }
        if (!interpretationIpfsHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu interpretationIpfsHash')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        // Contract: addClinicalInterpretation(uint256,bytes32,string)
        const encodedData = ehrManager.interface.encodeFunctionData('addClinicalInterpretation', [
            BigInt(recordId),
            interpretationHash,
            interpretationIpfsHash,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            doctorAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[prepareInterpretationTx] recordId=${recordId}, doctor=${doctorAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'addClinicalInterpretation(uint256,bytes32,string)',
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareCompleteTx
 * Bác sĩ chốt hồ sơ.
 * Contract: updateRecordStatus(recordId, 5) — COMPLETE = 5
 */
export const prepareCompleteTx = async (doctorAddress, recordId) => {
    try {
        if (!ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ bác sĩ không hợp lệ')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        const encodedData = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            5,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            doctorAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[prepareCompleteTx] recordId=${recordId}, doctor=${doctorAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus: 5,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareReceiveOrderTx
 * Lab tech tiếp nhận order.
 * Contract: updateRecordStatus(recordId, 2) — IN_PROGRESS = 2
 */
export const prepareReceiveOrderTx = async (labTechAddress, recordId) => {
    try {
        if (!ethers.isAddress(labTechAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ lab tech không hợp lệ')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        const encodedData = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            2,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            labTechAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[prepareReceiveOrderTx] recordId=${recordId}, labTech=${labTechAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus: 2,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * preparePostResultTx
 * Lab tech post kết quả xét nghiệm.
 * Contract: postLabResult(recordId, labResultHash, labResultIpfsHash)
 */
export const preparePostResultTx = async (labTechAddress, recordId, labResultHash, labResultIpfsHash = '') => {
    try {
        if (!ethers.isAddress(labTechAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ lab tech không hợp lệ')
        }

        if (!labResultHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu labResultHash')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        // Contract: postLabResult(uint256,bytes32,string)
        const encodedData = ehrManager.interface.encodeFunctionData('postLabResult', [
            BigInt(recordId),
            labResultHash,
            labResultIpfsHash,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            labTechAddress,
            ehrManager.target,
            encodedData,
        )

        console.log(`[preparePostResultTx] recordId=${recordId}, labTech=${labTechAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'postLabResult(uint256,bytes32,string)',
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * prepareAddDoctorTx
 * Admin thêm bác sĩ vào hệ thống.
 * Contract: AccountManager.addDoctor(doctor)
 */
export const prepareAddDoctorTx = async (adminAddress, doctorAddress) => {
    try {
        if (!ethers.isAddress(adminAddress) || !ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accountManager = blockchainContracts.read.accountManager
        if (!accountManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccountManager contract chưa khởi tạo')
        }

        const encodedData = accountManager.interface.encodeFunctionData('addDoctor', [
            doctorAddress,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            adminAddress,
            accountManager.target,
            encodedData,
        )

        console.log(`[prepareAddDoctorTx] admin=${adminAddress}, doctor=${doctorAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accountManager.target,
            functionSignature: 'addDoctor(address)',
            doctorAddress,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareAddLabTechTx
 * Admin thêm lab tech vào hệ thống.
 * Contract: AccountManager.addLabTech(labTech)
 */
export const prepareAddLabTechTx = async (adminAddress, labTechAddress) => {
    try {
        if (!ethers.isAddress(adminAddress) || !ethers.isAddress(labTechAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accountManager = blockchainContracts.read.accountManager
        if (!accountManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccountManager contract chưa khởi tạo')
        }

        const encodedData = accountManager.interface.encodeFunctionData('addLabTech', [
            labTechAddress,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            adminAddress,
            accountManager.target,
            encodedData,
        )

        console.log(`[prepareAddLabTechTx] admin=${adminAddress}, labTech=${labTechAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accountManager.target,
            functionSignature: 'addLabTech(address)',
            labTechAddress,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareAddPatientTx
 * Admin thêm patient vào hệ thống (ACTIVE ngay lập tức).
 * Contract: AccountManager.addPatient(patient)
 */
export const prepareAddPatientTx = async (adminAddress, patientAddress) => {
    try {
        if (!ethers.isAddress(adminAddress) || !ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }

        const accountManager = blockchainContracts.read.accountManager
        if (!accountManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccountManager contract chưa khởi tạo')
        }

        const encodedData = accountManager.interface.encodeFunctionData('addPatient', [
            patientAddress,
        ])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            adminAddress,
            accountManager.target,
            encodedData,
        )

        console.log(`[prepareAddPatientTx] admin=${adminAddress}, patient=${patientAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress: accountManager.target,
            functionSignature: 'addPatient(address)',
            patientAddress,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * verifyTransactionOnBlockchain
 * Xác thực txHash đã confirm trên chain và lấy thông tin receipt.
 * Dùng trong tất cả confirm* functions của ehrWorkflow.service.js.
 *
 * [Fix #1] Thêm export — trước đây thiếu export khiến import * as metaMaskTxBuilder
 *          không thấy hàm này → tất cả confirm* crash với "is not a function".
 */
export const verifyTransactionOnBlockchain = async (txHash) => {
    try {
        if (!ethers.isHexString(txHash, 32)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng transaction hash không hợp lệ')
        }

        const tx = await provider.getTransaction(txHash)
        if (!tx) {
            throw new ApiError(
                StatusCodes.NOT_FOUND,
                'Giao dịch không tìm thấy trên blockchain (có thể vẫn đang pending)',
            )
        }

        const receipt = await provider.getTransactionReceipt(txHash)
        if (!receipt) {
            // Tx tồn tại nhưng chưa được mine
            return {
                found: true,
                confirmed: false,
                txHash,
                from: tx.from,
                to: tx.to,
            }
        }

        console.log(`[verifyTx] Confirmed — block: ${receipt.blockNumber}, from: ${receipt.from}`)

        return {
            found: true,
            confirmed: true,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            from: receipt.from,
            to: receipt.to,
            gasUsed: receipt.gasUsed?.toString() || '0',
            status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
        }
    } catch (err) {
        console.error('[verifyTx] Thất bại:', err.message)
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Không thể xác thực giao dịch: ${err.message}`)
    }
}

export const metaMaskTxBuilder = {
    // Patient
    prepareConsentTx,
    prepareGrantAccessTx,
    prepareRevokeAccessTx,
    prepareUpdateAccessTx,
    // Doctor
    prepareAddRecordTx,
    prepareInterpretationTx,
    prepareCompleteTx,
    // Lab tech
    prepareReceiveOrderTx,
    preparePostResultTx,
    // Admin
    prepareAddDoctorTx,
    prepareAddLabTechTx,
    prepareAddPatientTx,
    // Verify
    verifyTransactionOnBlockchain,
}

export default metaMaskTxBuilder