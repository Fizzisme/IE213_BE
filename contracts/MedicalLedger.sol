// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IdentityManager.sol";
import "./DynamicAccessControl.sol";

/**
 * @title MedicalLedger
 * @dev Trụ cột 3: Sổ cái lưu vết Bệnh án y tế.
 * 
 * TRI THỨC WEB3:
 * 1. Hash-Chaining (Móc xích mã băm): Đây là kỹ thuật "vàng" để chống giả mạo. 
 *    Kết quả Lab phải băm kèm với hồ sơ ban đầu. Chẩn đoán phải băm kèm với kết quả Lab. 
 *    Nếu ai đó sửa Database ở bước đầu, toàn bộ chuỗi mắt xích phía sau sẽ bị báo lỗi.
 * 2. Hybrid Storage: Dữ liệu chi tiết nằm ở MongoDB, Blockchain chỉ lưu Hash (vân tay số) 
 *    để làm mốc đối chiếu sự thật (Source of Truth).
 */
contract MedicalLedger {
    IdentityManager public idManager;
    DynamicAccessControl public accessControl;

    // Các trạng thái hồ sơ - Phải đồng nhất với Logic Backend/MongoDB
    enum RecordStatus {
        CREATED,          // 0: Bác sĩ khởi tạo
        WAITING_RESULT,   // 1: Đang chờ xét nghiệm
        HAS_RESULT,       // 2: Đã có kết quả Lab
        DIAGNOSED,        // 3: Bác sĩ đã chẩn đoán
        COMPLETE          // 4: Hồ sơ đã đóng vĩnh viễn
    }

    struct Record {
        address patient;         // Chủ sở hữu hồ sơ
        address creatorDoctor;   // Bác sĩ phụ trách
        RecordStatus status;     // Trạng thái hiện tại
        bytes32 recordHash;      // Lớp 1: Vân tay của triệu chứng/chỉ định ban đầu
        bytes32 testResultHash;  // Lớp 2: Vân tay của kết quả Lab (Móc nối vào Lớp 1)
        bytes32 diagnosisHash;   // Lớp 3: Vân tay của chẩn đoán cuối (Móc nối vào Lớp 2)
        uint256 updatedAt;       // Thời điểm cập nhật cuối
    }

    // Map từ MongoDB ObjectId (dạng string) sang thông tin On-chain
    mapping(string => Record) public records;

    error Unauthorized();
    error InvalidState();
    error NoAccess();

    event RecordUpdated(string indexed mongoId, RecordStatus status, uint256 timestamp);

    constructor(address _idManager, address _accessControl) {
        idManager = IdentityManager(_idManager);
        accessControl = DynamicAccessControl(_accessControl);
    }

    /**
     * @notice Bước 1: Bác sĩ tạo hồ sơ bệnh án mới.
     * @param mongoId ID của hồ sơ trong Database MongoDB.
     * @param patient Ví của bệnh nhân.
     * @param _recordHash Mã băm của thông tin bệnh án ban đầu (triệu chứng, tiền sử).
     */
    function createRecord(string calldata mongoId, address patient, bytes32 _recordHash) external {
        // Chỉ Bác sĩ đang hoạt động mới được tạo
        if (!idManager.hasRole(msg.sender, IdentityManager.Role.DOCTOR)) revert Unauthorized();
        // Phải có quyền truy cập hợp lệ từ Bệnh nhân (DynamicAccessControl)
        if (!accessControl.canAccess(patient, msg.sender)) revert NoAccess();

        records[mongoId] = Record({
            patient: patient,
            creatorDoctor: msg.sender,
            status: RecordStatus.CREATED,
            recordHash: _recordHash,
            testResultHash: bytes32(0),
            diagnosisHash: bytes32(0),
            updatedAt: block.timestamp
        });

        emit RecordUpdated(mongoId, RecordStatus.CREATED, block.timestamp);
    }

    /**
     * @notice Bước 2: Kỹ thuật viên (Lab Tech) nhập kết quả xét nghiệm.
     * @dev Áp dụng Hash-Chaining: băm kết quả Lab gộp chung với recordHash cũ.
     */
    function appendTestResult(string calldata mongoId, bytes32 _resultHash) external {
        // Kiểm tra role Kỹ thuật viên
        if (!idManager.hasRole(msg.sender, IdentityManager.Role.LAB_TECH)) revert Unauthorized();
        
        Record storage r = records[mongoId];
        if (r.status != RecordStatus.CREATED && r.status != RecordStatus.WAITING_RESULT) revert InvalidState();

        // THỰC THI HASH-CHAINING: Khóa cứng sự liên kết giữa Hồ sơ gốc và Kết quả Lab
        r.testResultHash = keccak256(abi.encodePacked(r.recordHash, _resultHash));
        r.status = RecordStatus.HAS_RESULT;
        r.updatedAt = block.timestamp;

        emit RecordUpdated(mongoId, RecordStatus.HAS_RESULT, block.timestamp);
    }

    /**
     * @notice Bước 3: Bác sĩ chốt chẩn đoán lâm sàng và đóng hồ sơ.
     */
    function closeRecord(string calldata mongoId, bytes32 _diagnosisHash) external {
        Record storage r = records[mongoId];
        
        // Chỉ Bác sĩ đã tạo hồ sơ ban đầu mới được chốt (Tránh can thiệp chéo)
        if (r.creatorDoctor != msg.sender) revert Unauthorized();
        // Phải có kết quả xét nghiệm rồi mới được chẩn đoán
        if (r.status != RecordStatus.HAS_RESULT) revert InvalidState();

        // MÓC XÍCH CUỐI CÙNG: Khóa toàn bộ quy trình
        r.diagnosisHash = keccak256(abi.encodePacked(r.testResultHash, _diagnosisHash));
        r.status = RecordStatus.COMPLETE;
        r.updatedAt = block.timestamp;

        emit RecordUpdated(mongoId, RecordStatus.COMPLETE, block.timestamp);
    }

    /**
     * @notice Hàm kiểm tra tính toàn vẹn (Verify Integrity).
     * @dev Bệnh nhân dùng hàm này để so khớp dữ liệu Off-chain hiện tại với On-chain.
     */
    function verifyIntegrity(string calldata mongoId, bytes32 currentHash, uint8 hashType) external view returns (bool) {
        Record memory r = records[mongoId];
        if (hashType == 0) return r.recordHash == currentHash;
        if (hashType == 1) return r.testResultHash == keccak256(abi.encodePacked(r.recordHash, currentHash));
        if (hashType == 2) return r.diagnosisHash == keccak256(abi.encodePacked(r.testResultHash, currentHash));
        return false;
    }
}
