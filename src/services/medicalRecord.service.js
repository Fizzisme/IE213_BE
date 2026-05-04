import { medicalRecordModel } from '~/models/medicalRecord.model';
import { testResultModel } from '~/models/testResult.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { patientModel } from '~/models/patient.model';
import { auditLogModel } from '~/models/auditLog.model';
import { userModel } from '~/models/user.model';
import { generateDataHash } from '~/utils/algorithms';
import { blockchainAbis, dynamicAccessControlContract, medicalLedgerContract } from '~/blockchains/contract';
import { blockchainProvider } from '~/blockchains/provider';
import { validateContractTransaction } from '~/utils/blockchainVerification';
import { rpcCache } from '~/utils/rpcCache';
import { env } from '~/config/environment';

// ============================================================
// SERVICE: TẠO HỒ SƠ BỆNH ÁN MỚI
//
// Luồng xử lý:
//   1. Xác nhận bệnh nhân tồn tại trong hệ thống
//   2. Lấy địa chỉ ví Blockchain của bệnh nhân
//   3. Kiểm tra không có hồ sơ nào đang còn dở dang (tránh tạo trùng)
//   4. Lưu hồ sơ mới vào MongoDB
//   5. Tính toán recordHash từ dữ liệu gốc
//   6. Trả về thông tin để Frontend ký giao dịch qua MetaMask
//
// Lưu ý quan trọng: Hàm này KHÔNG tự phát giao dịch lên Blockchain.
//   Nó chỉ chuẩn bị tham số và trả về cho Frontend tự ký.
//   Lý do: Chỉ bác sĩ (người dùng thật) mới được phép ký, không thể
//   dùng private key của server để thay thế.
// ============================================================
const createNew = async (patientId, data, currentUser) => {
    console.log(data);
    // Kiểm tra xem có bệnh nhân trong hệ thống không
    const patient = await patientModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

    // Lấy thông tin User để lấy Wallet Address của bệnh nhân
    const userPatient = await userModel.findById(patient.userId);
    const walletProvider = userPatient.authProviders.find((p) => p.type === 'WALLET');
    const patientWallet = walletProvider?.walletAddress;

    // Bệnh nhân bắt buộc phải liên kết ví Blockchain trước khi tạo hồ sơ.
    // Địa chỉ ví của bệnh nhân sẽ được ghi nhận trên Smart Contract
    // như là chủ sở hữu hợp pháp của dữ liệu y tế.
    if (!patientWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa liên kết ví Blockchain');
    }

    // Chỉ cho phép một hồ sơ đang xử lý cùng lúc trên mỗi bệnh nhân.
    // Tránh trường hợp bác sĩ tạo trùng hồ sơ, gây nhầm lẫn dữ liệu
    // và xung đột trạng thái trên Blockchain.
    const existingRecord = await medicalRecordModel.findOneByPatientId(patientId, [
        'CREATED',
        'WAITING_RESULT',
        'HAS_RESULT',
    ]);

    if (existingRecord.length) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Đã tồn tại hồ sơ chưa hoàn thành');
    }
    // Bản ghi mới gồm patientId, createdBy, type va note
    const newRecord = {
        patientId,
        createdBy: currentUser._id,
        type: data.type,
        clinicalNote: data.note,
        note: data.note,
        createdAt: new Date(),
    };
    const medicalRecord = await medicalRecordModel.createNew(newRecord);
    // Lỗi nếu tạo hồ sơ thất bại
    if (!medicalRecord) throw new ApiError(StatusCodes.BAD_REQUEST, 'Tạo hồ sơ bệnh án thất bại');

    // Tính toán Hash của hồ sơ bệnh án dựa trên dữ liệu gốc lúc tạo.
    // recordHash này sẽ được lưu lên Smart Contract như một dấu ấn toàn vẹn dữ liệu.
    // Bất kỳ thay đổi nào trong MongoDB sau này đều có thể bị phát hiện
    // bằng cách tính lại Hash và so sánh với giá trị đang lưu trên Blockchain.
    const recordHash = generateDataHash({
        type: medicalRecord.type,
        clinicalNote: medicalRecord.clinicalNote || medicalRecord.note || '',
        patientId: medicalRecord.patientId.toString(),
    });

    // Ghi nhận hành động tạo hồ sơ vào audit log để phục vụ truy vết sau này.
    // Lúc này Blockchain chưa được đồng bộ, trạng thái sẽ cập nhật
    // sau khi Frontend ký và gọi verifyTx thành công.
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'CREATE_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecord._id,
        details: { note: 'Doctor created new medical record, waiting for blockchain sync' },
    });

    // Trả về đủ thông tin để Frontend xây dựng và ký giao dịch Blockchain:
    //   - medicalRecordId: ID của hồ sơ vừa tạo trong MongoDB
    //   - patientWallet: địa chỉ ví bệnh nhân, dùng làm tham số trong Smart Contract
    //   - recordHash: hash toàn vẹn dữ liệu, cũng là tham số trong Smart Contract
    //   - blockchain: thông tin contract, method và args để Frontend gọi đúng hàm
    return {
        message: 'Hồ sơ đã được lưu, vui lòng xác nhận giao dịch trên MetaMask',
        medicalRecordId: medicalRecord._id,
        patientWallet,
        recordHash,
        blockchain: {
            contractAddress: medicalLedgerContract.target,
            method: 'createRecord',
            args: [medicalRecord._id.toString(), patientWallet, recordHash],
        },
    };
};

// ============================================================
// SERVICE: CHẨN ĐOÁN HỒ SƠ BỆNH ÁN
//
// Luồng xử lý:
//   1. Xác nhận hồ sơ tồn tại
//   2. Đảm bảo hồ sơ đang ở trạng thái HAS_RESULT (có kết quả xét nghiệm)
//   3. Xác nhận kết quả xét nghiệm hợp lệ
//   4. Cập nhật chẩn đoán vào MongoDB
//   5. Tính toán diagnosisHash từ dữ liệu chẩn đoán
//   6. Trả về thông tin để Frontend ký giao dịch đóng hồ sơ trên Blockchain
//
// Lưu ý: Chỉ hồ sơ ở trạng thái HAS_RESULT mới được chẩn đoán.
//   Ràng buộc này đảm bảo luồng nghiệp vụ nhất quán với Smart Contract,
//   tránh trường hợp bác sĩ bỏ qua bước xét nghiệm hoặc chẩn đoán lại
//   hồ sơ đã hoàn tất.
// ============================================================
const diagnosis = async (medicalRecordId, data, currentUser) => {
    // Kiểm tra xem đã có hồ sơ bệnh án để chẩn đoán
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không có hồ sơ bệnh án');

    // Đảm bảo trạng thái đồng bộ 100% với Smart Contract.
    // Chỉ HAS_RESULT mới được chẩn đoán.
    // Ngăn chặn việc bác sĩ "nhảy cóc" hoặc chẩn đoán lại hồ sơ đã xong.
    if (medicalRecord.status !== 'HAS_RESULT') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Hồ sơ chưa có kết quả xét nghiệm hoặc đã hoàn thành, không thể thực hiện chẩn đoán!',
        );
    }

    // Kiểm tra xem có Kết quả xét nghiệm chưa
    const testResult = await testResultModel.findOneById(data.testResultId);
    if (!testResult) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có kết quả xét nghiệm');

    const updateRecord = {
        testResultId: data.testResultId,
        diagnosis: data.diagnosis,
        diagnosisNote: data.note,
        status: 'DIAGNOSED',
    };

    // Lỗi hệ thống khi cập nhật
    const medicalRecordDiagnosed = await medicalRecordModel.update(medicalRecordId, updateRecord);
    if (!medicalRecordDiagnosed) throw new ApiError(StatusCodes.BAD_REQUEST, 'Chẩn đoán thất bại');

    // Tính toán Hash của dữ liệu chẩn đoán.
    // diagnosisHash này sẽ được dùng để đóng hồ sơ trên Smart Contract (closeRecord).
    // Việc bao gồm testResultId trong hash giúp ràng buộc chẩn đoán
    // với đúng kết quả xét nghiệm đã được ghi nhận trước đó,
    // tạo thành chuỗi Hash-Chaining xuyên suốt vòng đời hồ sơ.
    const diagnosisHash = generateDataHash({
        diagnosis: data.diagnosis,
        diagnosisNote: data.note || '',
        testResultId: data.testResultId.toString(),
    });

    // Ghi nhận hành động chẩn đoán vào audit log.
    // Blockchain vẫn chưa được đồng bộ ở bước này,
    // trạng thái COMPLETE chỉ được xác nhận sau khi verifyTx thành công.
    await auditLogModel.createLog({
        userId: currentUser._id,
        action: 'DIAGNOSIS_MEDICAL_RECORD',
        entityType: 'MEDICAL_RECORD',
        entityId: medicalRecordId,
        details: { note: 'Doctor diagnosis medical record, waiting for blockchain sync' },
    });

    return {
        message: 'Chẩn đoán đã được lưu, vui lòng xác nhận giao dịch trên MetaMask',
        medicalRecordId,
        diagnosisHash,
        blockchain: {
            contractAddress: medicalLedgerContract.target,
            method: 'closeRecord',
            args: [medicalRecordId.toString(), diagnosisHash],
        },
    };
};

// ============================================================
// SERVICE: KIỂM TRA TÍNH TOÀN VẸN DỮ LIỆU (3 TẦNG HASH-CHAINING)
//
// Cơ chế hoạt động:
//   Mỗi tầng Hash được xây dựng dựa trên tầng trước (Hash-Chaining),
//   đảm bảo không thể giả mạo dữ liệu ở bất kỳ bước nào mà không phá vỡ
//   toàn bộ chuỗi xác minh.
//
//   Tầng 1 (recordHash)     - Dữ liệu ban đầu khi tạo hồ sơ
//   Tầng 2 (resultHash)     - Kết quả xét nghiệm từ phòng Lab
//   Tầng 3 (diagnosisHash)  - Chẩn đoán cuối cùng của bác sĩ
//
// Hàm sẽ dừng và trả về lỗi ngay tại tầng đầu tiên phát hiện bất thường.
// ============================================================
const verifyIntegrity = async (medicalRecordId) => {
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ');

    // TẦNG 1: Luôn kiểm tra recordHash
    const recordHash = generateDataHash({
        type: medicalRecord.type,
        clinicalNote: medicalRecord.clinicalNote || medicalRecord.note || '',
        patientId: medicalRecord.patientId.toString(),
    });

    // TẦNG 2: Chuẩn bị resultHash (nếu cần)
    let resultHash = null;
    if (['HAS_RESULT', 'DIAGNOSED', 'COMPLETE'].includes(medicalRecord.status)) {
        let testResultData = null;
        if (medicalRecord.testResultId) {
            testResultData = await testResultModel.findOneById(medicalRecord.testResultId);
        } else if (testResultModel.TestResultModel) {
            testResultData = await testResultModel.TestResultModel.findOne({
                medicalRecordId: medicalRecordId,
            }).sort({ createdAt: -1 });
        }

        if (testResultData) {
            resultHash = generateDataHash({
                testType: testResultData.testType,
                rawData: testResultData.rawData,
                aiAnalysis: testResultData.aiAnalysis,
            });
        }
    }

    // TẦNG 3: Chuẩn bị diagnosisHash (nếu cần)
    let diagnosisHash = null;
    if (['DIAGNOSED', 'COMPLETE'].includes(medicalRecord.status)) {
        if (medicalRecord.diagnosis) {
            let testResultIdToHash = medicalRecord.testResultId?.toString();
            if (!testResultIdToHash) {
                const tr = await testResultModel.TestResultModel.findOne({ medicalRecordId: medicalRecordId }).sort({
                    createdAt: -1,
                });
                testResultIdToHash = tr?._id.toString();
            }

            diagnosisHash = generateDataHash({
                diagnosis: medicalRecord.diagnosis,
                diagnosisNote: medicalRecord.diagnosisNote || '',
                testResultId: testResultIdToHash,
            });
        }
    }

    // Gọi tất cả verifyIntegrity calls cùng lúc (SONG SONG - tối ưu)
    const verificationCalls = [
        medicalLedgerContract.verifyIntegrity(
            medicalRecordId.toString(),
            recordHash,
            0, // hashType = 0 - TẦNG 1
        ),
    ];

    // Thêm tầng 2 nếu cần
    if (resultHash !== null) {
        verificationCalls.push(
            medicalLedgerContract.verifyIntegrity(
                medicalRecordId.toString(),
                resultHash,
                1, // hashType = 1 - TẦNG 2
            )
        );
    }

    // Thêm tầng 3 nếu cần
    if (diagnosisHash !== null) {
        verificationCalls.push(
            medicalLedgerContract.verifyIntegrity(
                medicalRecordId.toString(),
                diagnosisHash,
                2, // hashType = 2 - TẦNG 3
            )
        );
    }

    // Gọi tất cả calls cùng lúc (tiết kiệm 67% thời gian)
    const verificationResults = await Promise.all(verificationCalls);

    // Kiểm tra kết quả
    if (!verificationResults[0]) {
        return { medicalRecordId, isValid: false, failedAt: 'CREATED', status: medicalRecord.status };
    }

    if (resultHash !== null && !verificationResults[1]) {
        return { medicalRecordId, isValid: false, failedAt: 'HAS_RESULT', status: medicalRecord.status };
    }

    if (diagnosisHash !== null && !verificationResults[2]) {
        return { medicalRecordId, isValid: false, failedAt: 'DIAGNOSED', status: medicalRecord.status };
    }

    return {
        medicalRecordId,
        isValid: true,
        status: medicalRecord.status,
        message: 'Dữ liệu y tế khớp hoàn toàn với Blockchain (Source of Truth)',
    };
};

// ============================================================
// SERVICE: XÁC MINH GIAO DỊCH SAU KHI FRONTEND KÝ QUA METAMASK
//
// Luồng xử lý:
//   1. Xác định hồ sơ bệnh án và bước vòng đời hiện tại
//   2. Xác định ví bác sĩ đang đăng nhập
//   3. Đọc giao dịch thô từ Blockchain theo txHash
//   4. Xác minh giao dịch đúng method, đúng tham số, đúng contract
//   5. Kiểm tra người ký là đúng bác sĩ hiện tại (chống mạo danh)
//   6. Chờ receipt xác nhận giao dịch thành công
//   7. Cập nhật trạng thái và txHash vào MongoDB
//
// Đây là bước "chốt" sau mỗi hành động quan trọng trong vòng đời hồ sơ:
//   - Sau createNew   -> trạng thái CREATED được đồng bộ Blockchain
//   - Sau labResult   -> trạng thái chuyển sang HAS_RESULT
//   - Sau diagnosis   -> trạng thái chuyển sang COMPLETE
// ============================================================
const verifyTx = async (medicalRecordId, txHash, currentUser) => {
    // Lấy hồ sơ bệnh án hiện tại để biết đang xác minh ở bước nào của vòng đời
    const medicalRecord = await medicalRecordModel.findOneById(medicalRecordId);
    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy hồ sơ');

    // Lấy địa chỉ ví của bác sĩ đang thực hiện yêu cầu.
    // Dùng để xác minh rằng giao dịch trên Blockchain phải do chính ví này ký,
    // ngăn chặn tấn công replay hoặc mạo danh từ ví khác.
    const doctorUser = await userModel.findById(currentUser._id);
    const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
    if (!doctorWallet) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Bác sĩ chưa liên kết ví Blockchain');
    }

    // Đọc giao dịch thô từ Blockchain để đối chiếu với những gì
    // hệ thống kỳ vọng (contract nào, method nào, tham số nào).
    const tx = await blockchainProvider.getTransaction(txHash);

    if (medicalRecord.status === 'CREATED') {
        // Nếu hồ sơ đang ở trạng thái CREATED: giao dịch hợp lệ phải là
        // lời gọi createRecord với đúng patientWallet và recordHash hiện tại.
        // Mọi sai lệch (sai method, sai hash, sai ví bệnh nhân) đều bị từ chối.
        const patient = await patientModel.findById(medicalRecord.patientId);
        if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

        const patientUser = await userModel.findById(patient.userId);
        const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;
        if (!patientWallet) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Bệnh nhân chưa liên kết ví Blockchain');
        }

        const recordHash = generateDataHash({
            type: medicalRecord.type,
            clinicalNote: medicalRecord.clinicalNote || medicalRecord.note || '',
            patientId: medicalRecord.patientId.toString(),
        });

        validateContractTransaction({
            tx,
            abi: blockchainAbis.MedicalLedger,
            expectedContract: medicalLedgerContract.target,
            expectedMethod: 'createRecord',
            expectedArgs: [medicalRecordId.toString(), patientWallet, recordHash],
        });
    } else if (medicalRecord.status === 'DIAGNOSED') {
        // Nếu hồ sơ đang ở trạng thái DIAGNOSED: giao dịch hợp lệ phải là
        // lời gọi closeRecord với đúng diagnosisHash được tính từ dữ liệu chẩn đoán hiện tại.
        const diagnosisHash = generateDataHash({
            diagnosis: medicalRecord.diagnosis,
            diagnosisNote: medicalRecord.diagnosisNote || '',
            testResultId: medicalRecord.testResultId.toString(),
        });

        validateContractTransaction({
            tx,
            abi: blockchainAbis.MedicalLedger,
            expectedContract: medicalLedgerContract.target,
            expectedMethod: 'closeRecord',
            expectedArgs: [medicalRecordId.toString(), diagnosisHash],
        });
    }

    // Dù giao dịch đúng method và tham số, vẫn phải kiểm tra xem
    // người ký có đúng là bác sĩ đang đăng nhập không.
    // Tránh trường hợp một ví khác (kể cả bác sĩ khác) ký thay.
    if (tx.from.toLowerCase() !== doctorWallet.toLowerCase()) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch blockchain không được ký bởi ví bác sĩ hiện tại');
    }

    // Chờ Receipt từ Blockchain để xác nhận giao dịch đã được đào thành công.
    // receipt.status === 1 nghĩa là giao dịch thành công trên mạng.
    const receipt = await blockchainProvider.waitForTransaction(txHash);

    if (receipt.status === 1) {
        // Tùy theo trạng thái hiện tại của hồ sơ mà lưu txHash vào trường tương ứng.
        // Mỗi bước trong vòng đời có một trường txHash riêng để dễ tra cứu sau này.
        let updateData = {
            'blockchainMetadata.isSynced': true,
            'blockchainMetadata.syncAt': new Date(),
        };

        if (medicalRecord.status === 'CREATED') {
            updateData['blockchainMetadata.createTxHash'] = txHash;
        } else if (medicalRecord.status === 'WAITING_RESULT') {
            updateData['blockchainMetadata.labTxHash'] = txHash;
            updateData['status'] = 'HAS_RESULT';
        } else if (medicalRecord.status === 'DIAGNOSED') {
            updateData['blockchainMetadata.diagnosisTxHash'] = txHash;
            // Đồng bộ trạng thái: Blockchain chuyển sang COMPLETE thì MongoDB cũng vậy.
            // Đây là nguyên tắc "Blockchain là nguồn sự thật" (Source of Truth)
            // trong thiết kế hệ thống này.
            updateData['status'] = 'COMPLETE';
        }

        // Cập nhật Database
        await medicalRecordModel.update(medicalRecordId, updateData);

        // Ghi nhận sự kiện đồng bộ Blockchain thành công vào audit log
        await auditLogModel.createLog({
            userId: medicalRecord.createdBy,
            action: 'VERIFY_BLOCKCHAIN_SYNC',
            entityType: 'MEDICAL_RECORD',
            entityId: medicalRecordId,
            details: {
                txHash,
                step: medicalRecord.status,
                note: `Blockchain sync verified for step: ${medicalRecord.status}`,
            },
        });

        return 'Đồng bộ Blockchain thành công';
    } else {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Giao dịch trên Blockchain thất bại');
    }
};

// ============================================================
// SERVICE: LẤY DANH SÁCH HỒ SƠ BỆNH ÁN (CÓ LỌC VÀ TÌM KIẾM)
//
// Hỗ trợ lọc theo trạng thái (statusArray), sắp xếp và tìm kiếm
// theo tên bệnh nhân hoặc số điện thoại.
// Dành cho bác sĩ và admin quản lý toàn bộ danh sách hồ sơ.
// ============================================================
const getAll = async (statusArray, sortOrder, q) => {
    // Loại bỏ các document đã bị xóa mềm
    const query = {
        _destroy: false,
    };
    // Nếu có statusArray thì thêm vào query
    if (statusArray && statusArray.length > 0) {
        query.status = { $in: statusArray };
    }

    // Lấy kèm thông tin bệnh nhân để Frontend hiển thị
    const medicalRecords = await medicalRecordModel.MedicalRecordModel.find(query)
        .populate({
            path: 'patientId',
            select: '_id fullName gender birthYear phoneNumber avatar',
        })
        .sort({ createdAt: sortOrder });

    let filteredRecords = medicalRecords;
    if (q) {
        const keyword = q.toLowerCase();

        // Tìm kiếm phía server (in-memory) theo tên và số điện thoại.
        // Cân nhắc chuyển sang MongoDB text index nếu dữ liệu lớn.
        filteredRecords = medicalRecords.filter((record) => {
            const patient = record.patientId;
            return (
                patient?.fullName?.toLowerCase().includes(keyword) ||
                patient?.phoneNumber?.toLowerCase().includes(keyword)
            );
        });
    }

    // Đổi tên trường patientId thành patientInfo để Frontend dễ đọc
    // và nhất quán với các API khác trong hệ thống
    return filteredRecords.map((record) => {
        const obj = record.toObject();

        obj.patientInfo = obj.patientId;
        delete obj.patientId;

        return obj;
    });
};

// ============================================================
// SERVICE: LẤY DANH SÁCH HỒ SƠ BỆNH ÁN CỦA MỘT BỆNH NHÂN CỤ THỂ
//
// Nếu người gọi là bác sĩ, bắt buộc phải kiểm tra quyền truy cập
// trên Smart Contract DynamicAccessControl trước khi trả dữ liệu.
// Cơ chế này đảm bảo bệnh nhân hoàn toàn kiểm soát được ai
// được phép xem hồ sơ của mình trên Blockchain.
// ============================================================
const getPatientMedicalRecords = async (patientId, currentUser) => {
    const patient = await patientModel.findById(patientId);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Bệnh nhân không tồn tại');

    if (currentUser.role === 'DOCTOR') {
        const doctorUser = await userModel.findById(currentUser._id);
        const doctorWallet = doctorUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

        const patientUser = await userModel.findById(patient.userId);
        const patientWallet = patientUser?.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet && patientWallet) {
            // Lưu cache: Access tokens được lưu cache đến khi hết hạn
            // Truy vấn trực tiếp lên Smart Contract để kiểm tra quyền truy cập.
            // Đây là kiểm soát quyền phi tập trung: database không thể override
            // quyết định đã được bệnh nhân ghi lên Blockchain.
            const hasAccess = await rpcCache.getOrFetch(
                `access:${patientWallet}:${doctorWallet}`,
                () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
                env.RPC_ACCESS_TTL // 1h TTL
            );
            if (!hasAccess) {
                throw new ApiError(
                    StatusCodes.FORBIDDEN,
                    'Bạn không có quyền truy cập hồ sơ của bệnh nhân này trên Blockchain',
                );
            }
        }
    }

    const medicalRecords = await medicalRecordModel.MedicalRecordModel.find({
        patientId,
        _destroy: false,
    })
        .populate({
            path: 'patientId',
            select: '_id userId fullName gender birthYear phoneNumber avatar',
        })
        .sort({ createdAt: -1 });

    return medicalRecords.map((record) => {
        const obj = record.toObject();
        obj.patientInfo = obj.patientId;
        delete obj.patientId;
        return obj;
    });
};

// ============================================================
// SERVICE: LẤY CHI TIẾT MỘT HỒ SƠ BỆNH ÁN
//
// Ngoài kiểm tra quyền Blockchain (giống getPatientMedicalRecords),
// hàm này còn tự động đính kèm kết quả xét nghiệm (testResult)
// vào object hồ sơ trả về, hỗ trợ nhiều kịch bản lưu trữ khác nhau.
// ============================================================
const getDetail = async (medicalRecordId, currentUser) => {
    // Lấy hồ sơ bệnh án kèm thông tin bệnh nhân
    let medicalRecord = await medicalRecordModel.MedicalRecordModel.findById(medicalRecordId).populate({
        path: 'patientId',
        select: '_id userId fullName gender birthYear phoneNumber avatar',
    });

    if (!medicalRecord) throw new ApiError(StatusCodes.NOT_FOUND, 'Lấy hồ sơ thất bại');

    // Nếu người xem là bác sĩ, phải kiểm tra quyền xem On-chain qua DynamicAccessControl.
    // Quyền truy cập có thể hết hạn hoặc bị bệnh nhân thu hồi bất kỳ lúc nào.
    if (currentUser.role === 'DOCTOR') {
        const doctorUser = await userModel.findById(currentUser._id);
        const doctorWallet = doctorUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

        const patientUser = await userModel.findById(medicalRecord.patientId.userId);
        const patientWallet = patientUser.authProviders.find((p) => p.type === 'WALLET')?.walletAddress;

        if (doctorWallet && patientWallet) {
            // Lưu cache: Access tokens được lưu cache đến khi hết hạn
            const hasAccess = await rpcCache.getOrFetch(
                `access:${patientWallet}:${doctorWallet}`,
                () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
                env.RPC_ACCESS_TTL // 1h TTL
            );
            if (!hasAccess) {
                throw new ApiError(
                    StatusCodes.FORBIDDEN,
                    'Bạn không có quyền truy cập hồ sơ này trên Blockchain (Truy cập đã hết hạn hoặc chưa được cấp)',
                );
            }
        }
    }

    // Chuyển sang plain object để dễ dàng thêm/sửa thuộc tính gửi cho Frontend
    medicalRecord = medicalRecord.toObject();

    // Đồng bộ tên biến patientInfo giống hàm getAll
    if (medicalRecord.patientId) {
        medicalRecord.patientInfo = medicalRecord.patientId;
        delete medicalRecord.patientId;
    }

    // Đính kèm kết quả xét nghiệm vào hồ sơ trả về.
    // Hỗ trợ 3 kịch bản lưu trữ khác nhau để tương thích với nhiều phiên bản dữ liệu:
    //   Kịch bản A: Hồ sơ lưu sẵn testResultId hoặc relatedLabOrderIds
    //   Kịch bản B: Tìm ngược từ bảng TestResult dựa vào medicalRecordId (cách an toàn nhất)
    try {
        let testResultData = null;

        // Kịch bản A: Nếu Bệnh án có lưu sẵn testResultId hoặc mảng relatedLabOrderIds
        if (medicalRecord.testResultId) {
            testResultData = await testResultModel.findOneById(medicalRecord.testResultId);
        } else if (medicalRecord.relatedLabOrderIds && medicalRecord.relatedLabOrderIds.length > 0) {
            testResultData = await testResultModel.findOneById(medicalRecord.relatedLabOrderIds[0]);
        }
        // Kịch bản B: Tìm ngược từ bảng TestResult (Cách an toàn nhất)
        // Dựa vào Swagger, TestResult lưu medicalRecordId bên trong nó
        else if (testResultModel.TestResultModel) {
            testResultData = await testResultModel.TestResultModel.findOne({
                medicalRecordId: medicalRecordId,
            }).sort({ createdAt: -1 });
        }

        // Nếu tìm thấy kết quả từ phòng Lab, đắp nó vào biến testResult cho Frontend đọc
        if (testResultData) {
            medicalRecord.testResult = testResultData;
        }
    } catch (error) {
        // Không throw error ở đây để tránh làm hỏng toàn bộ trang chi tiết
        // chỉ vì lỗi phụ từ phòng Lab. Ghi log để điều tra sau.
        console.error('Lỗi khi đính kèm kết quả Lab vào Bệnh án:', error);
    }

    return medicalRecord;
};

// ============================================================
// SERVICE: LẤY DANH SÁCH HỒ SƠ BỆNH ÁN CỦA CHÍNH BỆNH NHÂN ĐANG ĐĂNG NHẬP
// Tìm hồ sơ bệnh nhân liên kết với userId hiện tại,
// sau đó ủy quyền cho getPatientMedicalRecords để tránh lặp code.
// ============================================================
const getMyMedicalRecords = async (currentUser, statusArray = []) => {
    const patient = await patientModel.findByUserId(currentUser._id);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có hồ sơ bệnh nhân');

    return await getPatientMedicalRecords(patient._id.toString(), currentUser, statusArray);
};

// ============================================================
// SERVICE: LẤY CHI TIẾT HỒ SƠ BỆNH ÁN CỦA CHÍNH BỆNH NHÂN ĐANG ĐĂNG NHẬP
// Ngoài việc lấy chi tiết hồ sơ, còn kiểm tra thêm rằng
// hồ sơ yêu cầu phải thực sự thuộc về bệnh nhân đang đăng nhập,
// tránh trường hợp bệnh nhân A dùng ID hợp lệ để xem hồ sơ của bệnh nhân B.
// ============================================================
const getMyMedicalRecordDetail = async (medicalRecordId, currentUser) => {
    const patient = await patientModel.findByUserId(currentUser._id);
    if (!patient) throw new ApiError(StatusCodes.NOT_FOUND, 'Chưa có hồ sơ bệnh nhân');

    const medicalRecord = await getDetail(medicalRecordId, currentUser);
    const recordPatientId = medicalRecord?.patientInfo?._id?.toString();

    // Đảm bảo hồ sơ yêu cầu phải thuộc đúng bệnh nhân đang đăng nhập.
    // Ngăn chặn tấn công IDOR (Insecure Direct Object Reference):
    // bệnh nhân A không thể truy cập hồ sơ của bệnh nhân B
    // dù biết medicalRecordId hợp lệ.
    if (recordPatientId !== patient._id.toString()) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền xem hồ sơ bệnh án này');
    }

    return medicalRecord;
};

const verifyMyMedicalRecordIntegrity = async (medicalRecordId, currentUser) => {
    await getMyMedicalRecordDetail(medicalRecordId, currentUser);

    return await verifyIntegrity(medicalRecordId);
};

export const medicalRecordService = {
    createNew,
    diagnosis,
    getAll,
    getPatientMedicalRecords,
    getDetail,
    verifyIntegrity,
    verifyTx,
    getMyMedicalRecords,
    getMyMedicalRecordDetail,
    verifyMyMedicalRecordIntegrity,
};