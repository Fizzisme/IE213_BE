// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 * -----------------------------------------------------------------------------
 * EHRManager (V3 — Fixed)
 * -----------------------------------------------------------------------------
 * Vai trò chính:
 * - Lưu metadata hồ sơ y tế on-chain (record identity + hash proof + trạng thái).
 * - Không lưu dữ liệu khám chi tiết trực tiếp on-chain.
 * - Dùng 3 lớp hash độc lập để kiểm chứng toàn vẹn từng giai đoạn.
 *
 * Changelog (Fixed):
 * - [FIX #1] addRecord: bỏ revert InvalidIpfs() cho orderIpfsHash — IPFS là optional.
 *   Backend hiện tại chỉ lưu MongoDB, không dùng IPFS. Field vẫn giữ trong struct
 *   để tương lai tích hợp IPFS mà không cần đổi ABI.
 * - [FIX #2] postLabResult: bỏ revert InvalidIpfs() cho labResultIpfsHash — tương tự.
 * - [FIX #3] Xóa error InvalidIpfs vì không còn được dùng ở đâu trong contract.
 * - [FIX #5] Thêm field assignedLabTech vào struct Record và enforce on-chain:
 *   + addRecord: nhận thêm parameter assignedLabTech, validate isLabTech, lưu vào struct.
 *   + updateRecordStatus (CONSENTED→IN_PROGRESS): chỉ đúng assignedLabTech mới được receive.
 *   + postLabResult: chỉ đúng assignedLabTech mới được post kết quả.
 *   Trước đây backend enforce qua MongoDB nhưng contract không enforce → lab tech bất kỳ
 *   có thể tiếp nhận order của bệnh nhân bất kỳ on-chain.
 * -----------------------------------------------------------------------------
 */

// =========================================================================
// Interfaces
// =========================================================================

interface IAccessControl {
    enum AccessLevel {
        NONE,
        EMERGENCY,
        FULL,
        SENSITIVE
    }

    function checkAccessLevel(
        address patient,
        address accessor,
        AccessLevel requiredLevel
    ) external view returns (bool);
}

interface IAccountManagerForEHR {
    function isDoctor(address account) external view returns (bool);
    function isLabTech(address account) external view returns (bool);
    function isPatient(address account) external view returns (bool);
    function isAdmin(address account) external view returns (bool);
}

// =========================================================================
// Contract
// =========================================================================

contract EHRManager {

    // =========================================================================
    // Enums
    // =========================================================================

    /// @notice Các loại record xét nghiệm được hỗ trợ.
    enum RecordType {
        GENERAL,       // Xét nghiệm tổng quát
        HIV_TEST,      // Xét nghiệm HIV — yêu cầu quyền SENSITIVE
        DIABETES_TEST, // Xét nghiệm tiểu đường
        LAB_RESULT,    // Kết quả xét nghiệm khác
        PRESCRIPTION,  // Đơn thuốc — ngoài scope, không dùng
        DIAGNOSIS      // Chẩn đoán — ngoài scope, không dùng
    }

    /// @notice Trạng thái vòng đời của một record.
    /// @dev Thứ tự chuyển trạng thái hợp lệ duy nhất:
    ///      ORDERED → CONSENTED → IN_PROGRESS → RESULT_POSTED → DOCTOR_REVIEWED → COMPLETE
    enum RecordStatus {
        ORDERED,
        CONSENTED,
        IN_PROGRESS,
        RESULT_POSTED,
        DOCTOR_REVIEWED,
        COMPLETE
    }

    // =========================================================================
    // Structs
    // =========================================================================

    /**
     * @notice Metadata của một hồ sơ xét nghiệm lưu on-chain.
     *
     * @dev [FIX #5] Thêm field assignedLabTech — lab tech duy nhất được phép
     *      tiếp nhận và post kết quả cho record này. Được set bởi doctor khi addRecord.
     *
     * @dev [FIX #1 #2] orderIpfsHash và labResultIpfsHash vẫn giữ trong struct
     *      nhưng không còn bắt buộc phải có giá trị. Cho phép chuỗi rỗng khi
     *      backend chưa tích hợp IPFS. Field sẵn sàng để dùng trong tương lai.
     */
    struct Record {
        uint256 id;
        address patient;
        address author;
        address assignedLabTech;     // [FIX #5] Lab tech được doctor chỉ định on-chain
        RecordType recordType;
        RecordStatus status;

        // Lớp 1: Order proof — bác sĩ tạo khi addRecord()
        bytes32 orderHash;
        string orderIpfsHash;        // [FIX #1] Optional — có thể rỗng nếu chưa dùng IPFS

        // Lớp 2: Lab result proof — lab tech post, LOCK ngay sau khi ghi
        bytes32 labResultHash;
        string labResultIpfsHash;    // [FIX #2] Optional — có thể rỗng nếu chưa dùng IPFS

        // Lớp 3: Clinical interpretation proof — bác sĩ thêm sau khi có kết quả lab
        bytes32 interpretationHash;
        string interpretationIpfsHash;

        IAccessControl.AccessLevel requiredLevel;
        uint64 createdAt;
        uint64 updatedAt;
        bool active;
    }

    // =========================================================================
    // State Variables
    // =========================================================================

    IAccountManagerForEHR public immutable accountManager;
    IAccessControl public immutable accessControl;

    uint256 public nextRecordId = 1;

    mapping(uint256 => Record) private records;
    mapping(address => uint256[]) private patientRecordIds;

    // =========================================================================
    // Events
    // =========================================================================

    event RecordAdded(
        uint256 indexed recordId,
        address indexed patient,
        address indexed author,
        address assignedLabTech,     // [FIX #5] Emit luôn để off-chain index được
        bytes32 contentHash,
        string ipfsHash,
        uint256 timestamp
    );

    event RecordStatusUpdated(
        uint256 indexed recordId,
        RecordStatus status,
        uint256 timestamp
    );

    event RecordUpdated(
        uint256 indexed recordId,
        bytes32 contentHash,
        string ipfsHash,
        uint256 timestamp
    );

    // =========================================================================
    // Custom Errors
    // =========================================================================

    error InvalidAddress();
    error NotFound();
    error AccessDenied();
    error InvalidHash();
    // [FIX #3] Đã xóa: error InvalidIpfs() — không còn dùng sau khi IPFS trở thành optional
    error InvalidLevel();
    error InvalidRole();
    error InvalidStatusTransition();
    error NotAuthor();
    error NotAssignedLabTech();      // [FIX #5] Lab tech gọi không phải người được assign

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    modifier recordExists(uint256 recordId) {
        if (records[recordId].id == 0 || !records[recordId].active) revert NotFound();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address accountManagerAddress, address accessControlAddress)
        validAddress(accountManagerAddress)
        validAddress(accessControlAddress)
    {
        accountManager = IAccountManagerForEHR(accountManagerAddress);
        accessControl  = IAccessControl(accessControlAddress);
    }

    // =========================================================================
    // Doctor: Tạo lab order
    // =========================================================================

    /**
     * @notice Bác sĩ tạo lab order mới cho bệnh nhân.
     *
     * @dev [FIX #1] Bỏ validate orderIpfsHash != rỗng. IPFS là optional.
     *      Backend hiện tại lưu metadata vào MongoDB, không cần IPFS URL.
     *      Field vẫn được lưu vào struct nếu có, để tương lai tích hợp IPFS.
     *
     * @dev [FIX #5] Thêm parameter assignedLabTech:
     *      - Phải là địa chỉ hợp lệ (không phải address(0)).
     *      - Phải là lab tech ACTIVE theo AccountManager.
     *      - Được lưu vào Record.assignedLabTech và emit trong RecordAdded.
     *      - Sau khi set, chỉ đúng địa chỉ này mới được receive và post kết quả.
     *
     * @param patient           Địa chỉ ví bệnh nhân.
     * @param recordType        Loại xét nghiệm.
     * @param requiredLevel     Mức quyền truy cập — phải khớp với recordType.
     * @param orderHash         keccak256 của metadata lab order.
     * @param orderIpfsHash     Địa chỉ IPFS (optional — có thể truyền chuỗi rỗng).
     * @param assignedLabTech   [FIX #5] Địa chỉ lab tech được chỉ định.
     * @return id               ID của record vừa tạo.
     */
    function addRecord(
        address patient,
        RecordType recordType,
        IAccessControl.AccessLevel requiredLevel,
        bytes32 orderHash,
        string calldata orderIpfsHash,
        address assignedLabTech      // [FIX #5] parameter mới
    )
        external
        validAddress(patient)
        validAddress(assignedLabTech)  // [FIX #5] validate không phải address(0)
        returns (uint256)
    {
        if (!accountManager.isDoctor(msg.sender))   revert InvalidRole();
        if (!accountManager.isPatient(patient))      revert InvalidRole();
        if (orderHash == bytes32(0))                 revert InvalidHash();
        // [FIX #1] Đã bỏ: if (bytes(orderIpfsHash).length == 0) revert InvalidIpfs();

        // [FIX #5] Validate assignedLabTech phải là lab tech ACTIVE
        if (!accountManager.isLabTech(assignedLabTech)) revert InvalidRole();

        IAccessControl.AccessLevel expectedLevel = _requiredLevelForType(recordType);
        if (requiredLevel != expectedLevel) revert InvalidLevel();

        if (!accessControl.checkAccessLevel(patient, msg.sender, expectedLevel)) revert AccessDenied();

        uint256 id = nextRecordId++;

        records[id] = Record({
            id:                     id,
            patient:                patient,
            author:                 msg.sender,
            assignedLabTech:        assignedLabTech,  // [FIX #5] lưu on-chain
            recordType:             recordType,
            status:                 RecordStatus.ORDERED,
            orderHash:              orderHash,
            orderIpfsHash:          orderIpfsHash,    // [FIX #1] optional, lưu nếu có
            labResultHash:          bytes32(0),
            labResultIpfsHash:      "",
            interpretationHash:     bytes32(0),
            interpretationIpfsHash: "",
            requiredLevel:          expectedLevel,
            createdAt:              uint64(block.timestamp),
            updatedAt:              uint64(block.timestamp),
            active:                 true
        });

        patientRecordIds[patient].push(id);

        // [FIX #5] Emit assignedLabTech để off-chain indexer biết
        emit RecordAdded(id, patient, msg.sender, assignedLabTech, orderHash, orderIpfsHash, block.timestamp);
        return id;
    }

    // =========================================================================
    // Doctor: Cập nhật order proof
    // =========================================================================

    /**
     * @notice Bác sĩ cập nhật nội dung lab order — chỉ được khi status còn ORDERED.
     * @dev Chỉ author của record mới được gọi.
     *
     * @param recordId    ID của record cần cập nhật.
     * @param newHash     keccak256 mới của metadata lab order.
     * @param newIpfsHash Địa chỉ IPFS mới (optional — có thể rỗng).
     */
    function updateOrderProof(
        uint256 recordId,
        bytes32 newHash,
        string calldata newIpfsHash
    ) external recordExists(recordId) {
        Record storage r = records[recordId];

        if (r.author != msg.sender)           revert NotAuthor();
        if (newHash == bytes32(0))            revert InvalidHash();
        if (r.status != RecordStatus.ORDERED) revert InvalidStatusTransition();

        r.orderHash     = newHash;
        r.orderIpfsHash = newIpfsHash;
        r.updatedAt     = uint64(block.timestamp);

        emit RecordUpdated(recordId, newHash, newIpfsHash, block.timestamp);
    }

    // =========================================================================
    // Lab Tech: Post kết quả kỹ thuật
    // =========================================================================

    /**
     * @notice Lab tech post kết quả xét nghiệm kỹ thuật — hash bị lock ngay sau khi ghi.
     *
     * @dev [FIX #2] Bỏ validate labResultIpfsHash != rỗng. IPFS là optional.
     *
     * @dev [FIX #5] Thêm check: chỉ assignedLabTech mới được post kết quả.
     *      Trước đây bất kỳ lab tech nào cũng post được — lỗ hổng bảo mật on-chain.
     *      Error mới: NotAssignedLabTech nếu msg.sender != r.assignedLabTech.
     *
     * @param recordId          ID của record cần post kết quả.
     * @param labResultHash     keccak256 của kết quả kỹ thuật.
     * @param labResultIpfsHash Địa chỉ IPFS (optional — có thể truyền chuỗi rỗng).
     */
    function postLabResult(
        uint256 recordId,
        bytes32 labResultHash,
        string calldata labResultIpfsHash
    ) external recordExists(recordId) {
        Record storage r = records[recordId];

        if (!accountManager.isLabTech(msg.sender))  revert InvalidRole();
        if (!_isLabRecord(r.recordType))             revert InvalidRole();
        if (r.status != RecordStatus.IN_PROGRESS)    revert InvalidStatusTransition();
        if (labResultHash == bytes32(0))             revert InvalidHash();
        // [FIX #2] Đã bỏ: if (bytes(labResultIpfsHash).length == 0) revert InvalidIpfs();

        // [FIX #5] Chỉ lab tech được assign mới được post kết quả
        if (msg.sender != r.assignedLabTech) revert NotAssignedLabTech();

        // Ghi vào field riêng — orderHash KHÔNG bị chạm
        // Sau dòng này labResultHash bị lock, không có hàm nào ghi đè được
        r.labResultHash     = labResultHash;
        r.labResultIpfsHash = labResultIpfsHash; // [FIX #2] optional, lưu nếu có
        r.status            = RecordStatus.RESULT_POSTED;
        r.updatedAt         = uint64(block.timestamp);

        emit RecordUpdated(recordId, labResultHash, labResultIpfsHash, block.timestamp);
        emit RecordStatusUpdated(recordId, RecordStatus.RESULT_POSTED, block.timestamp);
    }

    // =========================================================================
    // Doctor: Thêm diễn giải lâm sàng
    // =========================================================================

    /**
     * @notice Bác sĩ thêm diễn giải lâm sàng sau khi có kết quả lab.
     * @dev labResultHash và orderHash KHÔNG bị chạm — 3 lớp proof hoàn toàn độc lập.
     *
     * @param recordId                  ID của record cần thêm diễn giải.
     * @param interpretationHash        keccak256 của nội dung diễn giải lâm sàng.
     * @param interpretationIpfsHash    Địa chỉ IPFS chứa nội dung diễn giải.
     */
    function addClinicalInterpretation(
        uint256 recordId,
        bytes32 interpretationHash,
        string calldata interpretationIpfsHash
    ) external recordExists(recordId) {
        Record storage r = records[recordId];

        if (!accountManager.isDoctor(msg.sender))    revert InvalidRole();
        if (r.status != RecordStatus.RESULT_POSTED)  revert InvalidStatusTransition();
        if (interpretationHash == bytes32(0))        revert InvalidHash();
        if (bytes(interpretationIpfsHash).length == 0) revert InvalidHash();

        if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();

        r.interpretationHash     = interpretationHash;
        r.interpretationIpfsHash = interpretationIpfsHash;
        r.status                 = RecordStatus.DOCTOR_REVIEWED;
        r.updatedAt              = uint64(block.timestamp);

        emit RecordStatusUpdated(recordId, RecordStatus.DOCTOR_REVIEWED, block.timestamp);
    }

    // =========================================================================
    // State Machine: Các transition còn lại
    // =========================================================================

    /**
     * @notice Xử lý các chuyển trạng thái không gắn với việc ghi dữ liệu:
     *         ORDERED → CONSENTED (bệnh nhân đồng ý)
     *         CONSENTED → IN_PROGRESS (lab tech tiếp nhận)
     *         DOCTOR_REVIEWED → COMPLETE (bác sĩ chốt hồ sơ)
     *
     * @dev [FIX #5] CONSENTED → IN_PROGRESS: thêm check msg.sender == r.assignedLabTech.
     *      Trước đây bất kỳ lab tech nào cũng có thể tiếp nhận order của bệnh nhân bất kỳ.
     *      Giờ phải đúng lab tech được doctor chỉ định từ addRecord.
     *
     * @param recordId  ID của record cần chuyển trạng thái.
     * @param newStatus Trạng thái mới muốn chuyển đến.
     */
    function updateRecordStatus(
        uint256 recordId,
        RecordStatus newStatus
    ) external recordExists(recordId) {
        Record storage r = records[recordId];
        RecordStatus oldStatus = r.status;
        bool isDoctor  = accountManager.isDoctor(msg.sender);
        bool isPatient = accountManager.isPatient(msg.sender);

        // ORDERED → CONSENTED: Chỉ đúng bệnh nhân của record mới được consent
        if (oldStatus == RecordStatus.ORDERED && newStatus == RecordStatus.CONSENTED) {
            if (!(isPatient && msg.sender == r.patient)) revert AccessDenied();
        }
        // CONSENTED → IN_PROGRESS: Lab tech tiếp nhận
        else if (oldStatus == RecordStatus.CONSENTED && newStatus == RecordStatus.IN_PROGRESS) {
            if (!accountManager.isLabTech(msg.sender)) revert InvalidRole();
            if (!_isLabRecord(r.recordType))            revert InvalidRole();

            // [FIX #5] Enforce: chỉ lab tech được assign bởi doctor mới được receive
            // Trước đây: bất kỳ lab tech nào cũng pass được check này on-chain
            if (msg.sender != r.assignedLabTech) revert NotAssignedLabTech();
        }
        // DOCTOR_REVIEWED → COMPLETE: Bác sĩ chốt hồ sơ
        else if (oldStatus == RecordStatus.DOCTOR_REVIEWED && newStatus == RecordStatus.COMPLETE) {
            if (!isDoctor) revert InvalidRole();
            if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();
        }
        else {
            revert InvalidStatusTransition();
        }

        r.status    = newStatus;
        r.updatedAt = uint64(block.timestamp);
        emit RecordStatusUpdated(recordId, newStatus, block.timestamp);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /**
     * @notice Lấy toàn bộ thông tin của một record.
     * @dev Bệnh nhân sở hữu record được đọc tự do.
     *      Người khác cần có grant hợp lệ từ AccessControl.
     */
    function getRecord(uint256 recordId)
        external view
        recordExists(recordId)
        returns (Record memory)
    {
        Record memory r = records[recordId];

        if (msg.sender == r.patient) return r;

        if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();

        return r;
    }

    /**
     * @notice Lấy danh sách ID tất cả record thuộc về một bệnh nhân.
     * @dev Bệnh nhân và admin được đọc tự do.
     *      Bác sĩ/lab tech cần grant FULL trở lên.
     */
    function getPatientRecordIds(address patient)
        external view
        validAddress(patient)
        returns (uint256[] memory)
    {
        if (msg.sender != patient && !accountManager.isAdmin(msg.sender)) {
            if (!accessControl.checkAccessLevel(patient, msg.sender, IAccessControl.AccessLevel.FULL)) revert AccessDenied();
        }

        return patientRecordIds[patient];
    }

    /**
     * @notice Kiểm tra toàn vẹn dữ liệu bằng cách so sánh hash on-chain với hash tính lại.
     * @dev Chỉ bệnh nhân, admin, hoặc người có quyền truy cập mới được verify.
     *
     * @param recordId      ID của record cần verify.
     * @param computedHash  Hash tính lại ở backend từ file thực tế.
     * @param hashType      Lớp hash: 0=orderHash, 1=labResultHash, 2=interpretationHash.
     * @return true nếu hash khớp, false nếu không khớp.
     */
    function verifyRecordHash(
        uint256 recordId,
        bytes32 computedHash,
        uint8 hashType
    ) external view recordExists(recordId) returns (bool) {
        Record memory r = records[recordId];

        if (msg.sender != r.patient && !accountManager.isAdmin(msg.sender)) {
            if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();
        }

        if (hashType == 0) return r.orderHash == computedHash;
        if (hashType == 1) return r.labResultHash == computedHash;
        if (hashType == 2) return r.interpretationHash == computedHash;
        revert InvalidHash();
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// @dev Kiểm tra record có thuộc nhóm xét nghiệm lab tech được phép thao tác không.
    function _isLabRecord(RecordType recordType) internal pure returns (bool) {
        return recordType == RecordType.HIV_TEST
            || recordType == RecordType.DIABETES_TEST
            || recordType == RecordType.LAB_RESULT
            || recordType == RecordType.GENERAL;
    }

    /// @dev Tính mức quyền tối thiểu theo loại record.
    ///      HIV_TEST yêu cầu SENSITIVE. Các loại còn lại yêu cầu FULL.
    function _requiredLevelForType(RecordType recordType)
        internal pure
        returns (IAccessControl.AccessLevel)
    {
        if (recordType == RecordType.HIV_TEST) {
            return IAccessControl.AccessLevel.SENSITIVE;
        }
        return IAccessControl.AccessLevel.FULL;
    }
}
