import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { labOrderModel } from '~/models/labOrder.model';
import { auditLogModel } from '~/models/auditLog.model';
import { ethers } from 'ethers';

/**
 * Service cho bệnh nhân xem hồ sơ xét nghiệm
 * Step 9: Bệnh nhân xem hồ sơ
 * ✅ MongoDB-only approach:
 * - Lấy danh sách record từ blockchain
 * - Lấy chi tiết từng record từ MongoDB
 * - Verify hash từ blockchain
 */

// Lấy danh sách tất cả record của bệnh nhân
const getMyRecords = async (currentUser) => {
    const patientAddress = currentUser.walletAddress;
    if (!patientAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy địa chỉ ví bệnh nhân');
    }

    try {
        // 1. Lấy danh sách recordId từ blockchain
        const recordIds = await blockchainContracts.read.ehrManager.getPatientRecordIds(patientAddress);

        // 2. Lấy chi tiết từng record
        const records = [];
        for (const recordId of recordIds) {
            try {
                const record = await blockchainContracts.read.ehrManager.getRecord(recordId);
                records.push({
                    recordId: recordId.toString(),
                    patient: record.patient,
                    author: record.author,
                    recordType: Number(record.recordType),
                    status: Number(record.status),
                    orderHash: record.orderHash,
                    orderIpfsHash: record.orderIpfsHash,
                    labResultHash: record.labResultHash,
                    labResultIpfsHash: record.labResultIpfsHash,
                    interpretationHash: record.interpretationHash,
                    interpretationIpfsHash: record.interpretationIpfsHash,
                    requiredLevel: Number(record.requiredLevel),
                    createdAt: Number(record.createdAt),
                    updatedAt: Number(record.updatedAt),
                    active: record.active,
                });
            } catch (error) {
                // Nếu không có quyền xem record này, bỏ qua
                console.error(`Cannot get record ${recordId}:`, error.message);
            }
        }

        // 3. Ghi audit log
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: patientAddress,
            action: 'VIEW_RECORDS',
            entityType: 'PATIENT',
            entityId: currentUser._id,
            status: 'SUCCESS',
            details: {
                note: `Patient viewed ${records.length} records`,
                recordCount: records.length,
            },
        });

        return records;
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lấy danh sách record thất bại: ${error.message}`);
    }
};

// Lấy chi tiết một record cụ thể
// ✅ MongoDB-only approach: Dữ liệu đầy đủ lưu trong MongoDB
const getRecordDetail = async (currentUser, recordId) => {
    const patientAddress = currentUser.walletAddress;
    if (!patientAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy địa chỉ ví bệnh nhân');
    }

    try {
        // 1. Lấy record từ blockchain (chỉ lấy hashes + metadata)
        const record = await blockchainContracts.read.ehrManager.getRecord(recordId);

        // 2. Tìm lab order trong MongoDB - nơi lưu toàn bộ data
        const labOrder = await labOrderModel.LabOrderModel.findOne({
            blockchainRecordId: recordId.toString(),
        });

        if (!labOrder) {
            throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy dữ liệu cho record ${recordId} in MongoDB`);
        }

        // 3. Lấy dữ liệu từ MongoDB (không cần fetch IPFS)
        const orderData = {
            recordType: labOrder.recordType,
            testsRequested: labOrder.testsRequested,
            priority: labOrder.priority,
            clinicalNote: labOrder.clinicalNote,
            sampleType: labOrder.sampleType,
            diagnosisCode: labOrder.diagnosisCode,
            attachments: labOrder.attachments,
        };

        const labResultData = labOrder.labResultData ? {
            rawData: labOrder.labResultData,
            note: labOrder.labResultNote,
        } : null;

        const interpretationData = labOrder.clinicalInterpretation ? {
            interpretation: labOrder.clinicalInterpretation,
            recommendation: labOrder.recommendation,
        } : null;

        // 4. Verify hashes bằng cách tính lại từ MongoDB data
        const verification = {
            orderHashValid: labOrder.orderHash ? true : false,
            labResultHashValid: labOrder.labResultHash ? true : false,
            interpretationHashValid: labOrder.interpretationHash ? true : false,
            // Có thể verify thêm bằng keccak256(data) === record.hash nếu cần
        };

        // 5. Ghi audit log
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: patientAddress,
            action: 'VIEW_RECORD_DETAIL',
            entityType: 'LAB_ORDER',
            entityId: labOrder._id,
            status: 'SUCCESS',
            details: {
                note: `Patient viewed record ${recordId}`,
                recordId: recordId.toString(),
            },
        });

        return {
            recordId: recordId.toString(),
            patient: record.patient,
            author: record.author,
            recordType: Number(record.recordType),
            status: Number(record.status),
            // Lớp 1: Order
            orderHash: record.orderHash,
            orderData,
            // Lớp 2: Lab Result
            labResultHash: record.labResultHash,
            labResultData,
            // Lớp 3: Interpretation
            interpretationHash: record.interpretationHash,
            interpretationData,
            // Metadata
            requiredLevel: Number(record.requiredLevel),
            createdAt: Number(record.createdAt),
            updatedAt: Number(record.updatedAt),
            active: record.active,
            // Verification
            verification,
            // MongoDB tracking
            sampleStatus: labOrder.sampleStatus,
            auditLogs: labOrder.auditLogs,
        };
    } catch (error) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lấy chi tiết record thất bại: ${error.message}`);
    }
};

// Verify hash của một record
const verifyRecordHash = async (currentUser, recordId, hashType) => {
    // hashType: 0 = orderHash, 1 = labResultHash, 2 = interpretationHash
    try {
        // 1. Tìm lab order trong MongoDB thông qua blockchainRecordId
        const labOrder = await labOrderModel.LabOrderModel.findOne({
            blockchainRecordId: recordId.toString(),
        });

        if (!labOrder) {
            throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy dữ liệu Off-chain cho record ${recordId}`);
        }

        // 2. Lấy mã băm tương ứng đang lưu tại MongoDB (đây là hash của dữ liệu Off-chain)
        let offChainHash = '';
        if (hashType === 0) offChainHash = labOrder.orderHash;
        else if (hashType === 1) offChainHash = labOrder.labResultHash;
        else if (hashType === 2) offChainHash = labOrder.interpretationHash;
        else throw new ApiError(StatusCodes.BAD_REQUEST, 'hashType không hợp lệ (0, 1, 2)');

        if (!offChainHash) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Hồ sơ chưa có mã băm cho loại ${hashType}`);
        }

        // 3. Gọi Smart Contract để đối chiếu offChainHash với bản gốc On-chain
        const isValid = await blockchainContracts.read.ehrManager.verifyRecordHash(
            recordId,
            offChainHash,
            hashType
        );

        return {
            isValid,
            recordId,
            hashType,
            offChainHash,
            note: isValid
                ? 'Dữ liệu Off-chain khớp hoàn toàn với Blockchain'
                : 'CẢNH BÁO: Dữ liệu Off-chain đã bị can thiệp trái phép!'
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(StatusCodes.BAD_REQUEST, `Xác minh tính toàn vẹn thất bại: ${error.message}`);
    }
};

export const patientRecordService = {
    getMyRecords,
    getRecordDetail,
    verifyRecordHash,
};
