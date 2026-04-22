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
            to:       toAddress,
            from:     fromAddress,
            data:     encodedData,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId:  network.chainId,
            value:    '0',
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
            contractAddress:   ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus:    1,
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
            contractAddress:   accessControl.target,
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
            contractAddress:   accessControl.target,
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
            contractAddress:   accessControl.target,
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

// ============================================================================
// DOCTOR OPERATIONS
// ============================================================================

/**
 * prepareAddRecordTx
 * Bác sĩ tạo lab order mới.
 * Contract V4: addRecord(patient, recordType, requiredLevel, orderHash)
 * [Fix #5] Bỏ orderIpfsHash — contract V4 không còn tham số này.
 */
export const prepareAddRecordTx = async (doctorAddress, patientAddress, recordTypeNum, requiredLevel, orderHash) => {
    try {
        if (!ethers.isAddress(doctorAddress) || !ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ không hợp lệ')
        }
        if (!orderHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu orderHash')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        // Contract V4: addRecord(address patient, RecordType, AccessLevel, bytes32 orderHash)
        const encodedData = ehrManager.interface.encodeFunctionData('addRecord', [
            patientAddress,
            recordTypeNum,
            requiredLevel,
            orderHash,
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
            contractAddress:   ehrManager.target,
            functionSignature: 'addRecord(address,uint8,uint8,bytes32)',
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareInterpretationTx
 * Bác sĩ thêm diễn giải lâm sàng.
 * Contract V4: addClinicalInterpretation(recordId, interpretationHash)
 * [Fix #4] Bỏ interpretationIpfsHash — contract V4 không còn tham số này.
 */
export const prepareInterpretationTx = async (doctorAddress, recordId, interpretationHash) => {
    try {
        if (!ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ bác sĩ không hợp lệ')
        }
        if (!interpretationHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu interpretationHash')
        }

        const ehrManager = blockchainContracts.read.ehrManager
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo')
        }

        // Contract V4: addClinicalInterpretation(uint256 recordId, bytes32 interpretationHash)
        const encodedData = ehrManager.interface.encodeFunctionData('addClinicalInterpretation', [
            BigInt(recordId),
            interpretationHash,
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
            contractAddress:   ehrManager.target,
            functionSignature: 'addClinicalInterpretation(uint256,bytes32)',
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
 * [Fix #2] Đổi từ 8 → 5 (khớp enum RecordStatus trong EHRManager.sol)
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
            5, // COMPLETE = 5 (ORDERED=0, CONSENTED=1, IN_PROGRESS=2, RESULT_POSTED=3, DOCTOR_REVIEWED=4, COMPLETE=5)
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
            contractAddress:   ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus:    5,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

// ============================================================================
// LAB TECH OPERATIONS
// ============================================================================

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
            2, // IN_PROGRESS
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
            contractAddress:   ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus:    2,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * preparePostResultTx
 * Lab tech post kết quả xét nghiệm.
 * Contract V4: postLabResult(recordId, labResultHash)
 * [Fix #3] Bỏ labResultIpfsHash — contract V4 không còn tham số này.
 */
export const preparePostResultTx = async (labTechAddress, recordId, labResultHash) => {
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

        // Contract V4: postLabResult(uint256 recordId, bytes32 labResultHash)
        const encodedData = ehrManager.interface.encodeFunctionData('postLabResult', [
            BigInt(recordId),
            labResultHash,
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
            contractAddress:   ehrManager.target,
            functionSignature: 'postLabResult(uint256,bytes32)',
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
            contractAddress:   accountManager.target,
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
            contractAddress:   accountManager.target,
            functionSignature: 'addLabTech(address)',
            labTechAddress,
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

/**
 * prepareRegisterPatientTx
 * Admin đăng ký patient trên blockchain.
 * Contract: AccountManager.registerPatient() — KHÔNG có tham số.
 * [Fix #6] Bỏ patientAddress — registerPatient() dùng msg.sender, không nhận arg.
 *
 * NOTE: Vì registerPatient() dùng msg.sender nên chính patient phải là người ký tx này.
 *       adminAddress ở đây là địa chỉ patient, không phải admin.
 *       Đổi tên tham số cho rõ nghĩa hơn.
 */
export const prepareRegisterPatientTx = async (patientAddress) => {
    try {
        if (!ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Địa chỉ patient không hợp lệ')
        }

        const accountManager = blockchainContracts.read.accountManager
        if (!accountManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccountManager contract chưa khởi tạo')
        }

        // registerPatient() không có tham số — msg.sender là người ký sẽ tự đăng ký
        const encodedData = accountManager.interface.encodeFunctionData('registerPatient', [])

        const { unsignedTx, nonce, chainId } = await buildUnsignedTx(
            patientAddress,
            accountManager.target,
            encodedData,
        )

        console.log(`[prepareRegisterPatientTx] patient=${patientAddress}`)

        return {
            unsignedTx,
            nonce,
            chainId,
            contractAddress:   accountManager.target,
            functionSignature: 'registerPatient()',
        }
    } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message)
    }
}

// ============================================================================
// BROADCAST & VERIFICATION
// ============================================================================

/**
 * verifyAndBroadcastSignedTx
 * Xác thực signed tx + broadcast lên blockchain.
 * Dùng khi backend cần tự broadcast (ít dùng trong MetaMask flow — thường frontend tự broadcast).
 */
export const verifyAndBroadcastSignedTx = async (signedTx, expectedSignerAddress, txContext) => {
    try {
        console.log(`[${txContext}] Xác thực signed transaction...`)

        let txObject
        try {
            txObject = ethers.Transaction.from(signedTx)
        } catch (err) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Định dạng signed tx không hợp lệ: ${err.message}`)
        }

        const normalizedRecovered = ethers.getAddress(txObject.from)
        const normalizedExpected  = ethers.getAddress(expectedSignerAddress)

        if (normalizedRecovered !== normalizedExpected) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Signer không khớp. Dự kiến: ${normalizedExpected}, nhận: ${normalizedRecovered}`,
            )
        }

        console.log(`[${txContext}] Signer hợp lệ: ${normalizedRecovered}`)

        const txResponse = await provider.broadcastTransaction(signedTx)
        console.log(`[${txContext}] Broadcast thành công. TxHash: ${txResponse.hash}`)

        const receipt = await Promise.race([
            txResponse.wait(1),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Blockchain confirmation timeout (60s)')), 60000),
            ),
        ])

        if (!receipt) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại (receipt null)')
        }
        if (receipt.status !== 1) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch bị revert (status: ${receipt.status})`)
        }

        console.log(`[${txContext}] Confirmed — block: ${receipt.blockNumber}, gas: ${receipt.gasUsed}`)

        return {
            txHash:           receipt.hash,
            blockNumber:      receipt.blockNumber,
            gasUsed:          receipt.gasUsed?.toString() || '0',
            status:           'SUCCESS',
            from:             normalizedRecovered,
            to:               receipt.to,
            confirmation:     1,
        }
    } catch (err) {
        console.error(`[${txContext}] Thất bại:`, err.message)
        if (err instanceof ApiError) throw err
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch thất bại: ${err.message}`)
    }
}

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
                found:     true,
                confirmed: false,
                txHash,
                from:      tx.from,
                to:        tx.to,
            }
        }

        console.log(`[verifyTx] Confirmed — block: ${receipt.blockNumber}, from: ${receipt.from}`)

        return {
            found:       true,
            confirmed:   true,
            txHash:      receipt.hash,
            blockNumber: receipt.blockNumber,
            from:        receipt.from,
            to:          receipt.to,
            gasUsed:     receipt.gasUsed?.toString() || '0',
            status:      receipt.status === 1 ? 'SUCCESS' : 'FAILED',
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
    prepareRegisterPatientTx,
    // Broadcast & verify
    verifyAndBroadcastSignedTx,
    verifyTransactionOnBlockchain,
}

export default metaMaskTxBuilder