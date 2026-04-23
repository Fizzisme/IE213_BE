import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { labOrderModel } from '~/models/labOrder.model';
import { medicalRecordModel } from '~/models/medicalRecord.model';
import { medicalRecordService } from '~/services/medicalRecord.service';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
import { patientModel } from '~/models/patient.model';
import { ethers } from 'ethers';
import { normalizeWalletAddress, compareWalletAddresses } from '~/utils/wallet';  // [Sửa #5] Utility ví tập trung
import metaMaskTxBuilder, { verifyTransactionOnBlockchain } from '~/utils/metaMaskTxBuilder';


const toHexChainId = (chainId) => `0x${Number(chainId).toString(16)}`;

const getUserEmail = (user) => user?.authProviders?.find((p) => p?.email)?.email || null;
const getUserDisplayName = (user) => user?.fullName || getUserEmail(user) || user?._id?.toString() || 'UNKNOWN';

const verifyRole = async (currentUser, expectedRole) => {
    if (!currentUser || currentUser.role !== expectedRole) {
        throw new ApiError(StatusCodes.FORBIDDEN, `Chỉ ${expectedRole} mới được phép thực hiện thao tác này`);
    }
};

const buildPrepareResponse = (action, preparedTx, details = {}) => {
    const { unsignedTx, chainId, functionSignature } = preparedTx;

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
    };
};

const prepareCreateLabOrder = async (data, currentUser) => {
    const payload = { ...data };
    delete payload.txHash;
    return createLabOrder(payload, currentUser);
};

const confirmCreateLabOrder = async (data, currentUser) => {
    if (!data?.txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận tạo lab order');
    }
    return createLabOrder(data, currentUser);
};

const verifyConfirmedTxByUser = async (walletAddress, txHash) => {
    if (!txHash) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu txHash để xác nhận giao dịch');
    }

    const verification = await verifyTransactionOnBlockchain(txHash);
    if (!verification.found) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy giao dịch trên blockchain');
    }
    if (!verification.confirmed) {
        throw new ApiError(StatusCodes.CONFLICT, 'Giao dịch chưa được xác nhận trên blockchain');
    }
    if (verification.status !== 'SUCCESS') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch thất bại trên blockchain');
    }

    if (!verification.from || verification.from.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            `Giao dịch không thuộc về wallet hiện tại. tx.from=${verification.from}, wallet=${walletAddress}`
        );
    }

    return verification;
};

const verifyTxFunctionCall = async ({ txHash, contract, functionName, argsValidator }) => {
    const tx = await blockchainContracts.provider.getTransaction(txHash);
    if (!tx) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy transaction data');
    }

    if (!tx.to || tx.to.toLowerCase() !== contract.target.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch không gửi tới contract đích');
    }

    const parsed = contract.interface.parseTransaction({
        data: tx.data,
        value: tx.value,
    });

    if (!parsed || parsed.name !== functionName) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Giao dịch không gọi đúng hàm ${functionName}`);
    }

    if (typeof argsValidator === 'function') {
        const validArgs = argsValidator(parsed.args);
        if (!validArgs) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Args không khớp cho hàm ${functionName}`);
        }
    }
};


// Xác minh dữ liệu bệnh nhân từ DB
// Bác sĩ gửi patientAddress, nhưng phải kiểm tra với patientId từ DB
const verifyPatientData = async (data) => {
    const { patientId, patientAddress } = data;

    if (!patientId || !patientAddress) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Cần cung cấp patientId và patientAddress'
        );
    }

    // Lấy hồ sơ bệnh nhân từ DB
    const patient = await patientModel.findById(patientId);
    if (!patient) {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            `Patient với ID ${patientId} không tồn tại`
        );
    }

    // Lấy địa chỉ ví thực tế từ user document
    const patientUser = await userModel.findById(patient.userId);
    if (!patientUser) {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            'Không tìm thấy user profile của bệnh nhân'
        );
    }

    // Tìm wallet từ authProviders
    const actualWallet = patientUser.authProviders?.find(p => p.walletAddress)?.walletAddress;
    if (!actualWallet) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Bệnh nhân chưa liên kết ví blockchain'
        );
    }

    // Kiểm tra địa chỉ request khớp với DB
    if (!compareWalletAddresses(patientAddress, actualWallet)) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Patient address không khớp với hệ thống. Request: ${patientAddress}, DB: ${actualWallet}`
        );
    }

    // Trả về dữ liệu bệnh nhân từ DB (không dùng dữ liệu từ request)
    return {
        patientId: patient._id,
        patientAddress: normalizeWalletAddress(actualWallet),
        patientName: patient.fullName || 'Unknown',
        patientDOB: patient.birthYear || 0,
    };
};

// Lấy địa chỉ ví từ currentUser
const getWalletAddress = async (currentUser) => {
    const user = await userModel.findById(currentUser._id);
    const walletAddress = user?.authProviders?.find((p) => p.walletAddress)?.walletAddress;
    if (!walletAddress) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy địa chỉ ví');
    }
    return walletAddress;
};

/**
 * Service tạo LabOrder (Bác sĩ gửi yêu cầu xét nghiệm)
 * - Sinh metadata, lưu vào MongoDB
 * - Gọi addRecord trên EHRManager
 * - Lưu lại recordId, trạng thái ORDERED
 */
// PHẠI khớp enum RecordType trong EHRManager.sol
const RECORD_TYPE_MAP = {
    GENERAL: 0,
    HIV_TEST: 1,
    DIABETES_TEST: 2,
    LAB_RESULT: 3,
};

// Kiểm tra định dạng địa chỉ ví hợp lệ
const validateWalletAddress = (address, fieldName = 'Wallet address') => {
    if (!address || !ethers.isAddress(address)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `${fieldName} không hợp lệ: ${address}`);
    }
};

// Tính orderHash từ metadata với sorted keys (đảm bảo tính nhất quán khi xác thực)
const generateOrderHash = (metadata) => {
    const sortedKeys = Object.keys(metadata).sort();
    const metadataString = JSON.stringify(metadata, sortedKeys);
    return ethers.keccak256(ethers.toUtf8Bytes(metadataString));
};

const createLabOrder = async (data, currentUser) => {
    let {
        patientAddress,
        medicalRecordId,      // Mới: Bắt buộc - ý định rõ ràng của bác sĩ
        recordType, // GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT
        testsRequested, // mảng các xét nghiệm
        priority,
        clinicalNote,
        sampleType,
        diagnosisCode,
        attachments, // tùy chọn
        assignedLabTech, // Lab tech được doctor chỉ định để làm xét nghiệm (ObjectId của user LAB_TECH)
        txHash: confirmedTxHash,
    } = data;

    // Bắt buộc: medicalRecordId PHẢI được cung cấp (quy tắc bảo mật)
    // Nguyên tắc: Không có hành vi bí ẩn/tự động cho dữ liệu y tế
    // assignedLabTech PHẢI được cung cấp - doctor xác định ai sẽ làm xét nghiệm
    if (!patientAddress || !recordType || !medicalRecordId || !assignedLabTech) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Thiếu thông tin bắt buộc: patientAddress, recordType, medicalRecordId, assignedLabTech\n' +
            'Bác sĩ phải chỉ rõ: hồ sơ bệnh án + lab tech sẽ làm xét nghiệm'
        );
    }

    // Chuẩn hóa recordType thành chữ hoa (keys của RECORD_TYPE_MAP là chữ hoa)
    if (typeof recordType === 'string') {
        recordType = recordType.toUpperCase().trim();
        console.log(`[Lab Order] recordType=${recordType}`);
    }

    // Kiểm tra định dạng địa chỉ ví
    validateWalletAddress(patientAddress, 'Patient address');

    // Kiểm tra recordType hợp lệ
    if (!Object.hasOwn(RECORD_TYPE_MAP, recordType)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `recordType không hợp lệ: ${recordType}. Chỉ chấp nhận: GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT`);
    }

    // Ghi log các giá trị trước khi gọi blockchain
    console.log(`[Lab Order] recordType=${recordType}, RECORD_TYPE_MAP[recordType]=${RECORD_TYPE_MAP[recordType]}`);
    console.log(`[Lab Order] requiredLevel=${recordType === 'HIV_TEST' ? 3 : 2}`);

    // Xác minh dữ liệu bệnh nhân từ DB
    // Không dựa trên request data, phải kiểm tra với DB
    const verifiedPatientData = await verifyPatientData(data);
    const { patientId, patientName, patientDOB } = verifiedPatientData;
    const normalizedPatientAddress = verifiedPatientData.patientAddress;

    // [Bảo mật] Xác thực Bản ghi Y tế RÕ RÀNG
    // Nguyên tắc: Bác sĩ phải chỉ rõ bản ghi NÀO lab order này thuộc về
    // Ngăn chặn gắn vào bản ghi sai (vô tình hoặc cố ý)
    try {
        const { medicalRecordModel } = await import('~/models/medicalRecord.model');
        const medicalRecord = await medicalRecordModel.MedicalRecordModel.findOne({
            _id: medicalRecordId,
            patientId: patientId,  // Ensure record belongs to this patient
            _destroy: false
        });
        // Nếu không phải medical record đó thì throw lỗi
        if (!medicalRecord) {
            throw new ApiError(
                StatusCodes.NOT_FOUND,
                `Hồ sơ bệnh án (ID: ${medicalRecordId}) không tồn tại hoặc đã bị xóa. ` +
                `Vui lòng kiểm tra lại và chọn hồ sơ đúng.`
            );
        }

        // [Sửa #2] Chỉ cho phép tạo lab order từ trạng thái CREATED hoặc WAITING_RESULT
        // Chuyển đổi hợp lệ: CREATED → WAITING_RESULT (lab mới) → HAS_RESULT → DIAGNOSED → COMPLETE
        // Chặn: DIAGNOSED (đã review), COMPLETE (hoàn tất), HAS_RESULT (kết quả đã được gửi)
        const validStatesForNewLabOrder = ['CREATED', 'WAITING_RESULT'];
        if (!validStatesForNewLabOrder.includes(medicalRecord.status)) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                `Không thể tạo lab order từ trạng thái: ${medicalRecord.status}. ` +
                `Chỉ tạo được từ trạng thái: CREATED (lần đầu) hoặc WAITING_RESULT (order cũ đang chờ). ` +
                `Vui lòng hoàn thành hồ sơ hiện tại trước.`
            );
        }

        console.log(`[Bản ghi Y tế Xác thực] Bản ghi ${medicalRecordId} OK - Trạng thái: ${medicalRecord.status}`);
    } catch (mrErr) {
        if (mrErr.statusCode) throw mrErr;  // Ném lại ApiError
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Kiểm tra hồ sơ bệnh án thất bại: ${mrErr.message}`);
    }

    // 1. Sinh metadata order chuẩn y khoa
    const metadata = {
        recordType,
        testsRequested: testsRequested || [],
        priority,
        clinicalNote,
        sampleType,
        diagnosisCode,
        attachments,
        createdBy: currentUser.walletAddress,
        createdAt: new Date().toISOString(),
    };

    // 2. Lưu metadata trực tiếp vào MongoDB 
    console.log(`[Lab Order] Lưu metadata vào MongoDB cho order: ${metadata.testsRequested.length} xét nghiệm`);

    // Tính orderHash = keccak256(metadata JSON)
    // Phải sort keys để JSON string nhất quán (tránh hash không khớp khi regenerate)
    const orderHash = generateOrderHash(metadata);
    console.log(`[Lab Order] Tạo orderHash: ${orderHash}`);

    // 4. Xác định mức truy cập theo recordType
    // HIV_TEST -> SENSITIVE (3), các loại còn lại -> FULL (2)
    const requiredLevel = recordType === 'HIV_TEST' ? 3 : 2;

    // 4.5. Xác thực lab tech được chỉ định
    // Kiểm tra: lab tech tồn tại, role = LAB_TECH, status = ACTIVE
    const labTech = await userModel.findById(assignedLabTech);
    if (!labTech) {
        throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy lab tech với ID: ${assignedLabTech}`);
    }
    // Role ko phải lab_tech thì báo lỗi
    if (labTech.role !== 'LAB_TECH') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `User ${assignedLabTech} không phải lab tech (role=${labTech.role})`
        );
    }
    const labTechDisplayName = getUserDisplayName(labTech);

    // Nếu lab_tech ko active thì báo lỗi 
    if (labTech.status !== 'ACTIVE') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Lab tech ${labTechDisplayName} không hoạt động (status=${labTech.status})`
        );
    }
    // Lấy wallet address của lab tech
    const labTechWalletAddress = normalizeWalletAddress(labTech.authProviders?.find(p => p.walletAddress)?.walletAddress);
    if (!labTechWalletAddress) 
        {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                `Lab tech ${labTechDisplayName} chưa liên kết ví blockchain`
            );
        }
    console.log(`[Lab Order] Lab tech xác thực: ${labTechDisplayName} (${assignedLabTech})`);

    const normalizedDoctorWalletForTx = normalizeWalletAddress(currentUser.walletAddress);

    // 5. Kiểm tra quyền truy cập từ blockchain
    // Bác sĩ chỉ có thể tạo order nếu bệnh nhân đã cấp quyền
    try {
        console.log(`[Lab Order] Kiểm tra quyền: bệnh nhân=${patientAddress}, bác sĩ=${normalizedDoctorWalletForTx}, mức=${requiredLevel}`);

        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            patientAddress.toLowerCase(),
            normalizedDoctorWalletForTx.toLowerCase(),
            requiredLevel
        );
        if (!hasAccess) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Bác sĩ không có quyền tạo ${recordType} order cho bệnh nhân này. Bệnh nhân chưa cấp quyền truy cập.`
            );
        }
    } catch (accessError) {
        if (accessError.statusCode === StatusCodes.FORBIDDEN) throw accessError;
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, `Kiểm tra quyền truy cập thất bại: ${accessError.message}`);
    }

    const recordTypeNum = RECORD_TYPE_MAP[recordType];
    if (typeof recordTypeNum !== 'number' || recordTypeNum < 0 || recordTypeNum > 5) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Invalid recordType: ${recordType} maps to ${recordTypeNum}. Expected 0-5.`
        );
    }

    if (typeof requiredLevel !== 'number' || requiredLevel < 0 || requiredLevel > 3) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Invalid requiredLevel: ${requiredLevel}. Expected 0-3.`
        );
    }

    if (!orderHash || orderHash.length !== 66 || !orderHash.startsWith('0x')) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Invalid orderHash: ${orderHash}. Expected 0x prefixed 64-char hex string.`
        );
    }

    if (!confirmedTxHash) {
        const preparedTx = await metaMaskTxBuilder.prepareAddRecordTx(
            normalizedDoctorWalletForTx,
            patientAddress,
            recordTypeNum,
            requiredLevel,
            orderHash,
            '',
            labTechWalletAddress,
        );

        return buildPrepareResponse('CREATE_LAB_ORDER', preparedTx, {
            patientAddress: normalizeWalletAddress(patientAddress),
            recordType,
            requiredLevel,
            orderHash,
            medicalRecordId,
            assignedLabTech,
        });
    }

    await verifyConfirmedTxByUser(normalizedDoctorWalletForTx, confirmedTxHash);

    await verifyTxFunctionCall({
        txHash: confirmedTxHash,
        contract: blockchainContracts.read.ehrManager,
        functionName: 'addRecord',
        argsValidator: (args) => {
            const argPatient = args?.[0]?.toLowerCase();
            const argRecordType = Number(args?.[1]);
            const argRequiredLevel = Number(args?.[2]);
            const argOrderHash = args?.[3];
            const argOrderIpfsHash = args?.[4];
            const argLabTech = args?.[5]?.toLowerCase(); 


            return (
                argPatient === normalizeWalletAddress(patientAddress).toLowerCase()
                && argRecordType === recordTypeNum
                && argRequiredLevel === requiredLevel
                && argOrderHash?.toLowerCase() === orderHash.toLowerCase()
                && (argOrderIpfsHash || '') === ''
                && argLabTech === labTechWalletAddress.toLowerCase()
            );
        },
    });

    // 6. Xác nhận và lấy recordId từ event
    let recordId = null;
    let txHash = confirmedTxHash;
    try {
        const receipt = await blockchainContracts.provider.getTransactionReceipt(confirmedTxHash);
        if (!receipt || receipt.status !== 1) {
            throw new ApiError(StatusCodes.CONFLICT, 'Giao dịch chưa được xác nhận thành công trên blockchain');
        }

        // Lấy recordId từ event RecordAdded
        const recordAddedEvent = receipt.logs?.find(log => {
            try {
                const parsed = blockchainContracts.read.ehrManager.interface.parseLog(log);
                return parsed?.name === 'RecordAdded';
            } catch {
                return false;
            }
        });

        if (recordAddedEvent) {
            const parsed = blockchainContracts.read.ehrManager.interface.parseLog(recordAddedEvent);
            recordId = parsed.args.recordId.toString();
        } else {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Không tìm thấy event RecordAdded trong transaction');
        }
    } catch (blockchainError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Gọi blockchain addRecord thất bại: ${blockchainError.message}`);
    }

    // 7. Lưu vào MongoDB để theo dõi
    // FIX #4: dùng normalizedDoctorWalletForTx thay vì gọi getWalletAddress() thêm lần nữa
    const labOrderDoc = await labOrderModel.LabOrderModel.create({
        patientAddress: normalizedPatientAddress,  // Từ DB đã xác minh
        patientId: patientId,                       // Từ DB đã xác minh
        patientName: patientName,                   // Từ DB đã xác minh
        patientDOB: patientDOB,                     // Từ DB đã xác minh
        testsRequested: testsRequested || [],
        priority,
        clinicalNote,
        sampleType,
        diagnosisCode,
        attachments,
        recordType,
        requiredLevel,  // SAVE THIS! (0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE)
        sampleStatus: 'ORDERED',
        blockchainRecordId: recordId,
        orderHash,
        // [GHI CHÚC LỤC ĐỎ] Ghi đôi chiều: medicalRecordId được CẬP ĐỊNH bởi bác sĩ (đã xác thực)
        // NO auto-attach - Doctor must choose which record this lab belongs to
        relatedMedicalRecordId: medicalRecordId,  // Đã xác thực ở trên↑
        // assignedLabTech được doctor chỉ định (đã xác thực)
        assignedLabTech: assignedLabTech,
        // Chỉ lưu MongoDB, không cần IPFS hash
        createdBy: normalizedDoctorWalletForTx,
        createdAt: new Date(),
        auditLogs: [
            {
                from: null,
                to: 'ORDERED',
                by: normalizedDoctorWalletForTx,
                at: new Date(),
                txHash,
            },
        ],
    });

    // [EXPLICIT LINKING] Link lab order to medical record
    // medicalRecordId came from doctor's explicit choice - no guessing
    // If this fails, patient doesn't lose the lab order, just loses the link
    try {
        const { medicalRecordModel } = await import('~/models/medicalRecord.model');

        await medicalRecordModel.MedicalRecordModel.findByIdAndUpdate(
            medicalRecordId,
            { $addToSet: { relatedLabOrderIds: labOrderDoc._id } },
            { new: true }
        );

        console.log(`[EXPLICIT LINK] Lab Order ${labOrderDoc._id} linked to Medical Record ${medicalRecordId}`);

        await medicalRecordService.updateStatus(medicalRecordId, 'WAITING_RESULT');
    } catch (linkErr) {
        console.error(`[EXPLICIT LINK] Failed: ${linkErr.message}`);
        // Đừng throw - lab order đã được tạo trên blockchain
        // Just log and continue (eventual consistency)
    }

    // 8. Ghi audit log
    // FIX #1: wrap try/catch — audit log không được làm fail cả request
    // FIX #2: xóa block comment trùng bên dưới
    // FIX #5: đổi số bước 7 → 8 (bước 7 đã dùng cho MongoDB)
    try {
        await auditLogModel.createLog({
            userId: currentUser._id,
            walletAddress: normalizedDoctorWalletForTx,
            action: 'CREATE_LAB_ORDER',
            entityType: 'LAB_ORDER',
            entityId: labOrderDoc._id,
            txHash,
            status: 'SUCCESS',
            details: {
                note: `Bác sĩ tạo lab order cho bệnh nhân ${patientAddress}`,
                recordType,
                recordId,
                orderHash,
            },
        });
    } catch (auditError) {
        console.error('[Lab Order] Audit log failed (non-blocking):', auditError.message);
    }

    return {
        recordId,
        txHash,
        status: 'ORDERED',
        labOrderId: labOrderDoc._id,
        orderHash,
    };
};

// Lấy chi tiết lab order (bác sĩ, bệnh nhân, lab tech đều có thể xem nhưng chỉ xem được order của mình hoặc bệnh nhân của mình)
const getLabOrderDetail = async (labOrderId, currentUser) => {
    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    // Kiểm tra quyền truy cập
    const walletAddress = await getWalletAddress(currentUser);
    const isOwner = labOrder.patientAddress.toLowerCase() === walletAddress.toLowerCase();
    const isCreator = labOrder.createdBy?.toLowerCase() === walletAddress.toLowerCase();
    const user = await userModel.findById(currentUser._id);
    const isAdmin = user?.role === 'ADMIN';
    const isAssignedLabTech = user?.role === 'LAB_TECH'
        && !!labOrder.assignedLabTech
        && labOrder.assignedLabTech.toString() === currentUser._id?.toString();

    if (!isOwner && !isCreator && !isAdmin && !isAssignedLabTech) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền xem lab order này');
    }

    return labOrder;
};
// Lấy danh sách lab orders với filter và phân trang (bác sĩ, bệnh nhân, lab tech đều có thể xem nhưng chỉ xem được order của mình hoặc bệnh nhân của mình)
const getLabOrders = async (currentUser, query) => {
    const { status, page = 1, limit = 10 } = query;
    const walletAddress = await getWalletAddress(currentUser);
    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);  // ← Normalize!
    const user = await userModel.findById(currentUser._id);

    const filter = {};

    //  DEBUG LOG
    console.log(`[getLabOrders] role=${user.role}, walletAddress=${normalizedWalletAddress}, status=${status}`);

    // Kiểm soát truy cập theo vai trò
    if (user.role === 'DOCTOR') {
        // Bác sĩ chỉ thấy order mình tạo
        filter.createdBy = normalizedWalletAddress;  // ← Use normalized
        if (status) {
            filter.sampleStatus = status;
        }
        console.log(`[getLabOrders] DOCTOR filter:`, filter);
    } else if (user.role === 'LAB_TECH') {
        // [Vấn đề 2] Lab tech chỉ xem orders được assign cho mình (không tự chọn)
        // - Phải là orders được admin/doctor phân công (assignedLabTech = current user._id)
        // - AND status phải là CONSENTED, IN_PROGRESS, RESULT_POSTED, hoặc COMPLETE
        const allowedStatuses = ['CONSENTED', 'IN_PROGRESS', 'RESULT_POSTED', 'COMPLETE'];

        if (status && !allowedStatuses.includes(status)) {
            throw new ApiError(
                StatusCodes.FORBIDDEN,
                `Lab tech không thể truy vấn status: ${status}. Chỉ được: ${allowedStatuses.join(', ')}`
            );
        }

        // Filter 1: Phải được assign cho user này
        filter.assignedLabTech = currentUser._id;

        // Filter 2: Nếu có status param, filter theo status
        if (status) {
            filter.sampleStatus = status;
        } else {
            // Mặc định filter: CONSENTED + IN_PROGRESS + RESULT_POSTED (orders cần xử lý)
            filter.sampleStatus = { $in: ['CONSENTED', 'IN_PROGRESS', 'RESULT_POSTED'] };
        }

        console.log(`[getLabOrders] LAB_TECH filter:`, filter);
        console.log(`[getLabOrders] LAB_TECH assigned to: ${currentUser._id}`);
    } else if (user.role === 'PATIENT') {
        // Bệnh nhân chỉ thấy order của mình
        filter.patientAddress = normalizedWalletAddress;  // ← Use normalized
        if (status) {
            filter.sampleStatus = status;
        }
        console.log(`[getLabOrders] PATIENT filter:`, filter);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // QUERY LOG WITH ENHANCED DIAGNOSTICS
    console.log(`[getLabOrders] BEFORE QUERY - Filter:`, JSON.stringify(filter));
    console.log(`[getLabOrders] normalizedWalletAddress value:`, normalizedWalletAddress);
    console.log(`[getLabOrders] normalizedWalletAddress type:`, typeof normalizedWalletAddress);
    console.log(`[getLabOrders] normalizedWalletAddress length:`, normalizedWalletAddress?.length);

    // Kiểm tra tất cả giá trị createdBy trong cơ sở dữ liệu cho vai trò DOCTOR
    if (user.role === 'DOCTOR') {
        const allOrders = await labOrderModel.LabOrderModel.find({}).select('createdBy').lean();
        const createdByValues = [...new Set(allOrders.map(o => o.createdBy))];
        console.log(`[getLabOrders] All unique createdBy values in DB:`, createdByValues);
        console.log(`[getLabOrders] Trying to match against:`, normalizedWalletAddress);

        // Check for exact match with doctors orders
        const doctorOrders = await labOrderModel.LabOrderModel.find({ createdBy: normalizedWalletAddress }).select('_id createdBy').lean();
        console.log(`[getLabOrders] Orders found with exact filter:`, doctorOrders.length);
    }

    const [labOrders, total] = await Promise.all([
        labOrderModel.LabOrderModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        labOrderModel.LabOrderModel.countDocuments(filter),
    ]);

    console.log(`[getLabOrders] AFTER QUERY - Found ${labOrders.length} orders, total count: ${total}`);

    return {
        labOrders,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
    };
};

/**
 * Delete lab order + cleanup medical record linking
 * Xóa chỉ định xét nghiệm và tự động remove khỏi medical record
 */
const deleteLabOrder = async (labOrderId, currentUser) => {
    try {
        await verifyRole(currentUser, 'DOCTOR');
        const currentDoctorWallet = normalizeWalletAddress(await getWalletAddress(currentUser));

        // 1️. Lấy lab order trước khi xóa (để biết relatedMedicalRecordId)
        const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);

        if (!labOrder) {
            throw new ApiError(
                StatusCodes.NOT_FOUND,
                `Lab order với ID ${labOrderId} không tồn tại`
            );
        }

        if (labOrder.createdBy?.toLowerCase() !== currentDoctorWallet.toLowerCase()) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Chỉ bác sĩ tạo order mới được xóa order này');
        }

        // 2️. Không cho phép xóa nếu đã tiến hành test (status >= CONSENTED)
        const protectedStatuses = ['CONSENTED', 'IN_PROGRESS', 'RESULT_POSTED', 'DOCTOR_REVIEWED', 'COMPLETE'];
        if (protectedStatuses.includes(labOrder.sampleStatus)) {
            throw new ApiError(
                StatusCodes.CONFLICT,
                `Không thể xóa order với status ${labOrder.sampleStatus}. Hãy dùng cancel() thay vì delete().`
            );
        }

        // 3️⃣ Xóa lab order khỏi MongoDB
        await labOrderModel.LabOrderModel.deleteOne({ _id: labOrderId });
        console.log(`Lab order ${labOrderId} đã xóa từ DB`);

        // 4️. Remove khỏi medical record array (cleanup linking)
        if (labOrder.relatedMedicalRecordId) {
            const result = await medicalRecordModel.MedicalRecordModel.findByIdAndUpdate(
                labOrder.relatedMedicalRecordId,
                {
                    $pull: { relatedLabOrderIds: labOrderId }  // ← Remove from array
                },
                { new: true }
            );
            console.log(`Lab order ${labOrderId} removed từ medical record ${labOrder.relatedMedicalRecordId}`);
        }

        // 5️. Log audit event
        try {
            await auditLogModel.createLog({
                userId: currentUser._id,
                walletAddress: currentDoctorWallet,
                action: 'DELETE_LAB_ORDER',
                entityType: 'LAB_ORDER',
                entityId: labOrderId,
                status: 'SUCCESS',
                details: {
                    orderId: labOrderId,
                    relatedMedicalRecordId: labOrder.relatedMedicalRecordId,
                    previousStatus: labOrder.sampleStatus,
                },
            });
        } catch (auditErr) {
            console.warn(`Lỗi ghi audit log:`, auditErr.message);
        }

        return {
            success: true,
            message: `Lab order ${labOrderId} đã xóa thành công`,
            deletedLabOrderId: labOrderId,
            cleanedFromMedicalRecordId: labOrder.relatedMedicalRecordId,
        };
    } catch (error) {
        console.error(`Error deleting lab order:`, error.message);
        throw error;
    }
};

/**
 * Cancel lab order (nhưng giữ lại record)
 * Thay đổi status thành CANCELLED, không xóa data
 */
const cancelLabOrder = async (labOrderId, currentUser, reason = 'Hủy yêu cầu') => {
    try {
        await verifyRole(currentUser, 'DOCTOR');
        const currentDoctorWallet = normalizeWalletAddress(await getWalletAddress(currentUser));

        // 1️⃣ Lấy lab order
        const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);

        if (!labOrder) {
            throw new ApiError(
                StatusCodes.NOT_FOUND,
                `Lab order với ID ${labOrderId} không tồn tại`
            );
        }

        if (labOrder.createdBy?.toLowerCase() !== currentDoctorWallet.toLowerCase()) {
            throw new ApiError(StatusCodes.FORBIDDEN, 'Chỉ bác sĩ tạo order mới được hủy order này');
        }

        // 2️⃣ Không cho phép cancel nếu đã xong
        if (labOrder.sampleStatus === 'COMPLETE') {
            throw new ApiError(
                StatusCodes.CONFLICT,
                `Không thể cancel order đã COMPLETE`
            );
        }

        if (labOrder.sampleStatus === 'CANCELLED') {
            throw new ApiError(
                StatusCodes.CONFLICT,
                `Lab order đã bị cancel`
            );
        }

        const previousStatus = labOrder.sampleStatus;

        // 3 Update status thành CANCELLED
        const updatedOrder = await labOrderModel.LabOrderModel.findByIdAndUpdate(
            labOrderId,
            {
                sampleStatus: 'CANCELLED',
                $push: {
                    auditLogs: {
                        from: previousStatus,
                        to: 'CANCELLED',
                        by: currentDoctorWallet,
                        at: new Date(),
                        reason,
                    },
                },
            },
            { new: true }
        );

        console.log(`Lab order ${labOrderId} đã cancel (${previousStatus} → CANCELLED)`);

        // KHÔNG xóa khỏi medical record - chỉ đổi status
        // Vì order này vẫn có thể được xem lịch sử

        // 5️Log audit event
        try {
            await auditLogModel.createLog({
                userId: currentUser._id,
                walletAddress: currentDoctorWallet,
                entityType: 'LAB_ORDER',
                entityId: labOrderId,
                action: 'CANCEL_LAB_ORDER',
                status: 'SUCCESS',
                details: {
                    orderId: labOrderId,
                    previousStatus,
                    newStatus: 'CANCELLED',
                    reason,
                },
            });
        } catch (auditErr) {
            console.warn(`Lỗi ghi audit log:`, auditErr.message);
        }

        return {
            success: true,
            message: `Lab order ${labOrderId} đã cancel thành công`,
            cancelledLabOrderId: labOrderId,
            previousStatus,
            newStatus: 'CANCELLED',
            reason,
        };
    } catch (error) {
        console.error(`Error canceling lab order:`, error.message);
        throw error;
    }
};

// [Vấn đề 3] Doctor assign order cho lab tech
const assignLabOrderToTech = async (currentUser, labOrderId, labTechId) => {
    // Xác thực: chỉ DOCTOR được phép assign
    await verifyRole(currentUser, 'DOCTOR');

    const doctorWalletAddress = await getWalletAddress(currentUser);
    const normalizedDoctorWallet = normalizeWalletAddress(doctorWalletAddress);

    const labOrder = await labOrderModel.LabOrderModel.findById(labOrderId);
    if (!labOrder) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab order');
    }

    if (labOrder.createdBy?.toLowerCase() !== normalizedDoctorWallet.toLowerCase()) {
        throw new ApiError(
            StatusCodes.FORBIDDEN,
            'Chỉ bác sĩ tạo order mới được phân công lab tech cho order này'
        );
    }

    // Kiểm tra: status phải là CONSENTED (chưa assign)
    if (labOrder.sampleStatus !== 'CONSENTED') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Chỉ có thể assign order ở trạng thái CONSENTED, hiện tại: ${labOrder.sampleStatus}`
        );
    }

    // Xác thực: lab tech tồn tại
    const labTech = await userModel.findById(labTechId);
    if (!labTech) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy lab tech');
    }

    if (labTech.role !== 'LAB_TECH') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `User ${labTechId} không phải lab tech`);
    }

    const labTechDisplayName = getUserDisplayName(labTech);
    const labTechEmail = getUserEmail(labTech);

    if (labTech.status !== 'ACTIVE') {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Lab tech ${labTechDisplayName} không hoạt động`);
    }

    const updatedOrder = await labOrderModel.LabOrderModel.findOneAndUpdate(
        {
            _id: labOrderId,
            sampleStatus: 'CONSENTED',
            createdBy: normalizedDoctorWallet,
        },
        {
            $set: { assignedLabTech: labTechId },
            $push: {
                auditLogs: {
                    from: 'CONSENTED',
                    to: 'CONSENTED',
                    by: normalizedDoctorWallet,
                    at: new Date(),
                    note: `Assigned lab tech ${labTechDisplayName}`,
                },
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        throw new ApiError(
            StatusCodes.CONFLICT,
            'Không thể assign vì order đã thay đổi trạng thái hoặc không còn thuộc bác sĩ hiện tại'
        );
    }

    // Ghi audit log
    await auditLogModel.createLog({
        userId: currentUser._id,
        walletAddress: normalizedDoctorWallet,
        action: 'ASSIGN_LAB_ORDER',
        entityType: 'LAB_ORDER',
        entityId: updatedOrder._id,
        status: 'SUCCESS',
        details: {
            note: `Doctor assigned order ${labOrderId} to lab tech ${labTechDisplayName}`,
            assignedLabTechId: labTechId,
            assignedLabTechName: labTechDisplayName,
        },
    });

    return {
        message: 'Phân công order thành công',
        orderId: updatedOrder._id.toString(),
        assignedLabTech: {
            id: labTech._id.toString(),
            name: labTechDisplayName,
            email: labTechEmail,
        },
        sampleStatus: updatedOrder.sampleStatus,
        updatedAt: new Date(),
    };
};

export const labOrderService = {
    prepareCreateLabOrder,
    confirmCreateLabOrder,
    getLabOrderDetail,
    getLabOrders,
    deleteLabOrder,
    cancelLabOrder,
    assignLabOrderToTech,
};

