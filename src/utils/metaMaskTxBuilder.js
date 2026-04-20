/**
 * Xây dựng và xác thực giao dịch MetaMask
 * 
 * Mục đích: Chuẩn bị unsigned transactions để frontend ký với MetaMask
 * - Không sử dụng private keys tại đây
 * - Chỉ encode contract calls & tính toán gas estimates
 * - Trả lại unsigned tx data để frontend ký
 */

import { ethers } from 'ethers';
import { provider } from '~/blockchain/provider';
import { blockchainContracts } from '~/blockchain/contract';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';

// ==============================================================================
// PHẦN 1: CHUẨN BỊ UNSIGNED TRANSACTION
// ==============================================================================

// Giá trị gasLimit mặc định cho các loại transaction
const DEFAULT_GAS_LIMIT = 300000;

/**
 * Chuẩn bị unsigned transaction cho CONSENT (bệnh nhân ký)
 * 
 * Hành động: Bệnh nhân xác nhận đồng ý với lab order
 * Function: updateRecordStatus(recordId, 1) với 1 = CONSENTED
 */
export const prepareConsentTx = async (patientAddress, recordId) => {
    try {
        // Kiểm tra địa chỉ hợp lệ
        if (!ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ bệnh nhân không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        // Encode function call (CHƯA KÝ)
        // Function: updateRecordStatus(uint256 recordId, uint8 status)
        // Status: 1 = CONSENTED
        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            1, // CONSENTED
        ]);

        console.log(`[prepareConsentTx] Encoded function call cho recordId: ${recordId}`);

        // Lấy nonce cho address này (pending = bao gồm unconfirmed txs)
        const nonce = await provider.getTransactionCount(patientAddress, 'pending');
        console.log(`[prepareConsentTx] Nonce: ${nonce}`);

        // Lấy thông tin network & gas price
        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        // Xây dựng unsigned transaction object (MetaMask sẽ tự xử lý gas)
        const unsignedTx = {
            to: ehrManager.target,
            from: patientAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareConsentTx] Unsigned tx chuẩn bị thành công`);
        console.log(`   - Contract: ${ehrManager.target}`);
        console.log(`   - From: ${patientAddress}`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedRecordStatus: 1,
        };
    } catch (error) {
        console.error('[prepareConsentTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho GRANT ACCESS (bệnh nhân ký)
 * 
 * Hành động: Bệnh nhân cấp quyền truy cập cho bác sĩ/lab tech
 * Function: grantAccess(address accessor, uint8 level, uint64 durationHours)
 */
export const prepareGrantAccessTx = async (patientAddress, accessorAddress, level, durationHours = 0) => {
    try {
        // Kiểm tra địa chỉ hợp lệ
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ không hợp lệ');
        }

        const accessControl = blockchainContracts.read.accessControl;
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo');
        }

        // Convert level: SENSITIVE=3, FULL=2
        const accessLevel = level === 'SENSITIVE' ? 3 : 2;

        // Encode function call (CHƯA KÝ)
        // Function: grantAccess(address accessor, uint8 level, uint64 durationHours)
        const encodedFunctionCall = accessControl.interface.encodeFunctionData('grantAccess', [
            accessorAddress,
            accessLevel,
            BigInt(durationHours),
        ]);

        console.log(`[prepareGrantAccessTx] Encoded function call cho accessor: ${accessorAddress}`);

        // Lấy nonce cho address này
        const nonce = await provider.getTransactionCount(patientAddress, 'pending');

        // Lấy thông tin network & gas price
        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        // Xây dựng unsigned transaction object
        const unsignedTx = {
            to: accessControl.target,
            from: patientAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareGrantAccessTx] Unsigned tx chuẩn bị thành công`);
        console.log(`   - Contract: ${accessControl.target}`);
        console.log(`   - Accessor: ${accessorAddress}`);
        console.log(`   - Level: ${level} (${accessLevel})`);
        console.log(`   - Duration: ${durationHours} hours`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: accessControl.target,
            functionSignature: 'grantAccess(address,uint8,uint64)',
            accessorAddress,
            accessLevel,
            durationHours,
        };
    } catch (error) {
        console.error('[prepareGrantAccessTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho REVOKE ACCESS (bệnh nhân ký)
 * 
 * Hành động: Bệnh nhân thu hồi quyền truy cập
 * Function: revokeAccess(address accessor)
 */
export const prepareRevokeAccessTx = async (patientAddress, accessorAddress) => {
    try {
        // Kiểm tra địa chỉ hợp lệ
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ không hợp lệ');
        }

        const accessControl = blockchainContracts.read.accessControl;
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo');
        }

        // Encode function call
        // Function: revokeAccess(address accessor)
        const encodedFunctionCall = accessControl.interface.encodeFunctionData('revokeAccess', [
            accessorAddress,
        ]);

        console.log(`[prepareRevokeAccessTx] Encoded function call cho accessor: ${accessorAddress}`);

        // Lấy nonce
        const nonce = await provider.getTransactionCount(patientAddress, 'pending');

        // Lấy thông tin network & gas price
        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        // Xây dựng unsigned transaction object
        const unsignedTx = {
            to: accessControl.target,
            from: patientAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareRevokeAccessTx] Unsigned tx chuẩn bị thành công`);
        console.log(`   - Contract: ${accessControl.target}`);
        console.log(`   - Accessor: ${accessorAddress}`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: accessControl.target,
            functionSignature: 'revokeAccess(address)',
            accessorAddress,
        };
    } catch (error) {
        console.error('[prepareRevokeAccessTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho UPDATE ACCESS (bệnh nhân ký)
 * 
 * Hành động: Bệnh nhân cập nhật quyền truy cập hiện tại
 * Function: updateAccess(address accessor, uint8 level, uint64 durationHours)
 */
export const prepareUpdateAccessTx = async (patientAddress, accessorAddress, level, durationHours = 0) => {
    try {
        // Kiểm tra địa chỉ hợp lệ
        if (!ethers.isAddress(patientAddress) || !ethers.isAddress(accessorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ không hợp lệ');
        }

        const accessControl = blockchainContracts.read.accessControl;
        if (!accessControl) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'AccessControl contract chưa khởi tạo');
        }

        // Convert level: SENSITIVE=3, FULL=2
        const accessLevel = level === 'SENSITIVE' ? 3 : 2;

        // Encode function call
        // Function: updateAccess(address accessor, uint8 level, uint64 durationHours)
        const encodedFunctionCall = accessControl.interface.encodeFunctionData('updateAccess', [
            accessorAddress,
            accessLevel,
            BigInt(durationHours),
        ]);

        console.log(`[prepareUpdateAccessTx] Encoded function call cho accessor: ${accessorAddress}`);

        // Lấy nonce
        const nonce = await provider.getTransactionCount(patientAddress, 'pending');

        // Lấy thông tin network & gas price
        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        // Xây dựng unsigned transaction object
        const unsignedTx = {
            to: accessControl.target,
            from: patientAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareUpdateAccessTx] Unsigned tx chuẩn bị thành công`);
        console.log(`   - Contract: ${accessControl.target}`);
        console.log(`   - Accessor: ${accessorAddress}`);
        console.log(`   - Level: ${level} (${accessLevel})`);
        console.log(`   - New duration: ${durationHours} hours`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: accessControl.target,
            functionSignature: 'updateAccess(address,uint8,uint64)',
            accessorAddress,
            accessLevel,
            durationHours,
        };
    } catch (error) {
        console.error('[prepareUpdateAccessTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho ADD RECORD (doctor ký)
 * Hành động: Bác sĩ tạo lab order mới
 * Function: addRecord(address patient, uint8 recordType, uint8 requiredLevel, bytes32 orderHash)
 */
export const prepareAddRecordTx = async (doctorAddress, patientAddress, recordTypeNum, requiredLevel, orderHash) => {
    try {
        if (!ethers.isAddress(doctorAddress) || !ethers.isAddress(patientAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        // Encode function call
        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('addRecord', [
            patientAddress,
            recordTypeNum,
            requiredLevel,
            orderHash,
        ]);

        console.log(`[prepareAddRecordTx] Encoded function call cho patient: ${patientAddress}`);

        const nonce = await provider.getTransactionCount(doctorAddress, 'pending');

        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        const unsignedTx = {
            to: ehrManager.target,
            from: doctorAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareAddRecordTx] Unsigned tx chuẩn bị thành công`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'addRecord(address,uint8,uint8,bytes32)',
        };
    } catch (error) {
        console.error('[prepareAddRecordTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho CLINICAL INTERPRETATION (doctor ký)
 * Hành động: Bác sĩ thêm diễn giải lâm sàn
 * Function: addClinicalInterpretation(uint256 recordId, bytes32 interpretationHash)
 */
export const prepareInterpretationTx = async (doctorAddress, recordId, interpretationHash) => {
    try {
        if (!ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ bác sĩ không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('addClinicalInterpretation', [
            BigInt(recordId),
            interpretationHash,
        ]);

        console.log(`[prepareInterpretationTx] Encoded function call cho recordId: ${recordId}`);

        const nonce = await provider.getTransactionCount(doctorAddress, 'pending');

        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        const unsignedTx = {
            to: ehrManager.target,
            from: doctorAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareInterpretationTx] Unsigned tx chuẩn bị thành công`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'addClinicalInterpretation(uint256,bytes32)',
        };
    } catch (error) {
        console.error('[prepareInterpretationTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho COMPLETE RECORD (doctor ký)
 * Hành động: Bác sĩ chốt hồ sơ
 * Function: updateRecordStatus(uint256 recordId, uint8 newStatus)
 * newStatus = 8 (COMPLETE)
 */
export const prepareCompleteTx = async (doctorAddress, recordId) => {
    try {
        if (!ethers.isAddress(doctorAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ bác sĩ không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            8, // COMPLETE
        ]);

        console.log(`[prepareCompleteTx] Encoded function call cho recordId: ${recordId}`);

        const nonce = await provider.getTransactionCount(doctorAddress, 'pending');

        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        const unsignedTx = {
            to: ehrManager.target,
            from: doctorAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareCompleteTx] Unsigned tx chuẩn bị thành công`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus: 8,
        };
    } catch (error) {
        console.error('[prepareCompleteTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho RECEIVE ORDER (lab tech ký)
 * Hành động: Lab tech tiếp nhận lab order
 * Function: updateRecordStatus(uint256 recordId, uint8 newStatus)
 * newStatus = 2 (IN_PROGRESS)
 */
export const prepareReceiveOrderTx = async (labTechAddress, recordId) => {
    try {
        if (!ethers.isAddress(labTechAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ lab tech không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('updateRecordStatus', [
            BigInt(recordId),
            2, // IN_PROGRESS
        ]);

        console.log(`[prepareReceiveOrderTx] Encoded function call cho recordId: ${recordId}`);

        const nonce = await provider.getTransactionCount(labTechAddress, 'pending');

        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        const unsignedTx = {
            to: ehrManager.target,
            from: labTechAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[prepareReceiveOrderTx] Unsigned tx chuẩn bị thành công`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'updateRecordStatus(uint256,uint8)',
            expectedStatus: 2,
        };
    } catch (error) {
        console.error('[prepareReceiveOrderTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

/**
 * Chuẩn bị unsigned transaction cho POST LAB RESULT (lab tech ký)
 * Hành động: Lab tech post kết quả xét nghiệm
 * Function: postLabResult(uint256 recordId, bytes32 labResultHash)
 */
export const preparePostResultTx = async (labTechAddress, recordId, labResultHash) => {
    try {
        if (!ethers.isAddress(labTechAddress)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng địa chỉ lab tech không hợp lệ');
        }

        const ehrManager = blockchainContracts.read.ehrManager;
        if (!ehrManager) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'EHRManager contract chưa khởi tạo');
        }

        const encodedFunctionCall = ehrManager.interface.encodeFunctionData('postLabResult', [
            BigInt(recordId),
            labResultHash,
        ]);

        console.log(`[preparePostResultTx] Encoded function call cho recordId: ${recordId}`);

        const nonce = await provider.getTransactionCount(labTechAddress, 'pending');

        const network = await provider.getNetwork();
        const feeData = await provider.getFeeData();

        const unsignedTx = {
            to: ehrManager.target,
            from: labTechAddress,
            data: encodedFunctionCall,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            gasPrice: feeData.gasPrice ? feeData.gasPrice.toString() : '0',
            chainId: network.chainId,
            value: '0',
        };

        console.log(`[preparePostResultTx] Unsigned tx chuẩn bị thành công`);

        return {
            unsignedTx,
            nonce,
            chainId: network.chainId,
            contractAddress: ehrManager.target,
            functionSignature: 'postLabResult(uint256,bytes32)',
        };
    } catch (error) {
        console.error('[preparePostResultTx] Lỗi:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
};

// ==============================================================================
// PHẦN 3: XÁC THỰC SIGNED TRANSACTION & BROADCAST
// ==============================================================================

/**
 * Xác thực signed transaction & broadcast lên blockchain
 * 
 * Chạy sau khi frontend ký với MetaMask
 * 1. Phân tích cú pháp signed tx
 * 2. Phục hồi địa chỉ signer
 * 3. Xác thực signer match với expected user
 * 4. Broadcast lên blockchain
 * 5. Chờ xác thực
 */
export const verifyAndBroadcastSignedTx = async (signedTx, expectedSignerAddress, txContext) => {
    try {
        console.log(`[${txContext}] Xác thực signed transaction...`);

        // Phân tích cú pháp signed transaction
        let txObject;
        try {
            txObject = ethers.Transaction.from(signedTx);
        } catch (error) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Định dạng signed transaction không hợp lệ: ${error.message}`);
        }

        console.log(`[${txContext}] Signed tx được phân tích thành công`);

        // Phục hồi địa chỉ signer từ signature
        const recoveredAddress = ethers.recoverAddress(
            ethers.hashTransaction({
                to: txObject.to,
                from: txObject.from,
                data: txObject.data,
                nonce: txObject.nonce,
                gasLimit: txObject.gasLimit,
                gasPrice: txObject.gasPrice,
                chainId: txObject.chainId,
                value: txObject.value,
            }),
            {
                r: txObject.r,
                s: txObject.s,
                v: txObject.v,
            }
        );

        console.log(`[${txContext}] Địa chỉ signer được phục hồi: ${recoveredAddress}`);

        // Xác thực signer match với expected user
        const normalizedRecovered = ethers.getAddress(recoveredAddress);
        const normalizedExpected = ethers.getAddress(expectedSignerAddress);

        if (normalizedRecovered !== normalizedExpected) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Signer không match. Dự kiến: ${normalizedExpected}, Nhận được: ${normalizedRecovered}`
            );
        }

        console.log(`[${txContext}] Signer xác thực thành công`);

        // Broadcast lên blockchain
        console.log(`[${txContext}] Broadcast lên blockchain...`);
        const txResponse = await provider.broadcastTransaction(signedTx);
        console.log(`[${txContext}] Broadcast thành công. TxHash: ${txResponse.hash}`);

        // Chờ xác thực (với timeout)
        console.log(`[${txContext}] Chờ xác thực blockchain...`);
        const receipt = await Promise.race([
            txResponse.wait(1), // Wait for 1 confirmation
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Blockchain confirmation timeout (60s)')),
                    60000
                )
            ),
        ]);

        if (!receipt) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại (receipt is null)');
        }

        if (receipt.status !== 1) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                `Giao dịch revert trên blockchain (status: ${receipt.status})`
            );
        }

        console.log(`[${txContext}] Giao dịch được xác thực trên blockchain`);
        console.log(`   - TxHash: ${receipt.hash}`);
        console.log(`   - Block: ${receipt.blockNumber}`);
        console.log(`   - Gas used: ${receipt.gasUsed?.toString()}`);

        return {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            transactionIndex: receipt.index,
            gasUsed: receipt.gasUsed?.toString() || '0',
            status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
            from: normalizedRecovered,
            to: receipt.to,
            confirmation: 1,
        };
    } catch (error) {
        console.error(`[${txContext}] Xác thực/Broadcast thất bại:`, error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch thất bại: ${error.message}`);
    }
};

/**
 * Xác thực giao dịch tồn tại trên blockchain & extract thông tin chi tiết
 * 
 * Dùng để xác thực txHash trước khi lưu vào MongoDB
 */
export const verifyTransactionOnBlockchain = async (txHash) => {
    try {
        if (!ethers.isHexString(txHash, 32)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Định dạng transaction hash không hợp lệ');
        }

        console.log(`Xác thực txHash: ${txHash}`);

        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Giao dịch không tìm thấy trên blockchain (có thể vẫn pending)');
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            console.log(`Giao dịch tìm thấy nhưng chưa được xác thực. Tx: ${txHash}`);
            return {
                found: true,
                confirmed: false,
                txHash,
                from: tx.from,
                to: tx.to,
                data: tx.data,
            };
        }

        console.log(`Giao dịch được xác thực. Block: ${receipt.blockNumber}`);

        return {
            found: true,
            confirmed: true,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            from: receipt.from,
            to: receipt.to,
            gasUsed: receipt.gasUsed?.toString() || '0',
            status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
        };
    } catch (error) {
        console.error('Xác thực giao dịch thất bại:', error.message);
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Không thể xác thực giao dịch: ${error.message}`);
    }
};

export default {
    prepareConsentTx,
    prepareGrantAccessTx,
    prepareRevokeAccessTx,
    prepareUpdateAccessTx,
    prepareAddRecordTx,
    prepareInterpretationTx,
    prepareCompleteTx,
    prepareReceiveOrderTx,
    preparePostResultTx,
    verifyAndBroadcastSignedTx,
    verifyTransactionOnBlockchain,
};
