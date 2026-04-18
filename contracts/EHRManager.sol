// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 * -----------------------------------------------------------------------------
 * EHRManager (V3)
 * -----------------------------------------------------------------------------
 * Vai trò chính:
 * - Lưu metadata hồ sơ y tế on-chain (record identity + hash proof + trạng thái).
 * - Không lưu dữ liệu khám chi tiết trực tiếp on-chain; nội dung thực tế nằm ở DB/IPFS.
 * - Dùng 3 lớp hash độc lập để kiểm chứng toàn vẹn từng giai đoạn.
 *
 * Nguyên tắc bảo mật/nghiệp vụ:
 * 1) Chỉ hỗ trợ record xét nghiệm (GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT).
 *    PRESCRIPTION và DIAGNOSIS nằm ngoài scope — hướng phát triển tương lai.
 * 2) requiredLevel bị ép theo recordType để tránh caller tự hạ quyền truy cập.
 * 3) State machine patient-centric chặt:
 *    ORDERED → CONSENTED → IN_PROGRESS → RESULT_POSTED → DOCTOR_REVIEWED → COMPLETE
 * 4) 3 lớp proof độc lập, không ghi đè lẫn nhau:
 *    - orderHash      : bác sĩ tạo, chỉ sửa được khi ORDERED.
 *    - labResultHash  : lab tech post, lock ngay — không ai sửa được sau đó.
 *    - interpretationHash: bác sĩ thêm sau khi có kết quả lab.
 * 5) verifyRecordHash yêu cầu quyền, tránh lộ thông tin qua API kiểm chứng.
 *
 * Mục tiêu:
 * - Đảm bảo tính auditable và toàn vẹn dữ liệu theo từng giai đoạn.
 * - Bệnh nhân luôn kiểm soát quyền truy cập dữ liệu của mình.
 * - Lab tech không thể thao tác ngoài phạm vi xét nghiệm.
 * -----------------------------------------------------------------------------
 */

// =========================================================================
// Interfaces
// =========================================================================

/// @notice Interface để EHRManager gọi AccessControl kiểm tra quyền truy cập.
interface IAccessControl {
    enum AccessLevel {
        NONE,       // Không cần quyền đặc biệt
        EMERGENCY,  // Quyền khẩn cấp — bác sĩ active mặc định có
        FULL,       // Quyền truy cập đầy đủ nghiệp vụ thông thường
        SENSITIVE   // Quyền truy cập dữ liệu nhạy cảm (HIV, v.v.)
    }

    function checkAccessLevel(
        address patient,
        address accessor,
        AccessLevel requiredLevel
    ) external view returns (bool);
}

/// @notice Interface để EHRManager tra cứu role/status tài khoản từ AccountManager.
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
    /// @dev PRESCRIPTION và DIAGNOSIS không được hỗ trợ trong phiên bản này.
    ///      _isLabRecord() dùng enum này để phân loại record lab tech được phép thao tác.
    enum RecordType {
        GENERAL,       // Xét nghiệm tổng quát
        HIV_TEST,      // Xét nghiệm HIV — yêu cầu quyền SENSITIVE
        DIABETES_TEST, // Xét nghiệm tiểu đường
        LAB_RESULT,    // Kết quả xét nghiệm khác
        PRESCRIPTION,  // Đơn thuốc — ngoài scope, không dùng
        DIAGNOSIS      // Chẩn đoán — ngoài scope, không dùng
    }

    /// @notice Trạng thái vòng đời của một record theo mô hình patient-centric.
    /// @dev Thứ tự chuyển trạng thái hợp lệ duy nhất:
    ///      ORDERED → CONSENTED → IN_PROGRESS → RESULT_POSTED → DOCTOR_REVIEWED → COMPLETE
    enum RecordStatus {
        ORDERED,         // Bác sĩ tạo lab order, chờ bệnh nhân đồng ý
        CONSENTED,       // Bệnh nhân xác nhận đồng ý, chờ lab tiếp nhận
        IN_PROGRESS,     // Lab tech đang thực hiện xét nghiệm
        RESULT_POSTED,   // Lab tech đã post kết quả kỹ thuật (hash locked)
        DOCTOR_REVIEWED, // Bác sĩ đã thêm diễn giải lâm sàng
        COMPLETE         // Hồ sơ đã chốt, không ai được sửa thêm
    }

    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice Metadata của một hồ sơ xét nghiệm lưu on-chain.
    /// @dev Dữ liệu thực tế (chi tiết xét nghiệm, diễn giải) lưu off-chain ở IPFS/MongoDB.
    ///      On-chain chỉ lưu hash để kiểm chứng toàn vẹn và trạng thái để điều phối workflow.
    struct Record {
        uint256 id;              // ID tự tăng, duy nhất on-chain
        address patient;         // Địa chỉ ví bệnh nhân sở hữu hồ sơ
        address author;          // Địa chỉ ví bác sĩ tạo order
        RecordType recordType;   // Loại xét nghiệm
        RecordStatus status;     // Trạng thái hiện tại trong workflow

        // Lớp 1: Order proof — bác sĩ tạo khi addRecord()
        // Chỉ được sửa khi status=ORDERED qua updateOrderProof()
        bytes32 orderHash;       // keccak256 của metadata lab order
        string orderIpfsHash;    // Địa chỉ IPFS chứa nội dung lab order

        // Lớp 2: Lab result proof — lab tech post qua postLabResult()
        // Bị LOCK ngay sau khi ghi, không ai sửa được kể cả bác sĩ hay admin
        bytes32 labResultHash;      // keccak256 của kết quả kỹ thuật
        string labResultIpfsHash;   // Địa chỉ IPFS chứa kết quả kỹ thuật

        // Lớp 3: Clinical interpretation proof — bác sĩ thêm qua addClinicalInterpretation()
        // Nội dung diễn giải lưu off-chain, on-chain chỉ lưu hash để bảo mật
        bytes32 interpretationHash;      // keccak256 của diễn giải lâm sàng
        string interpretationIpfsHash;   // Địa chỉ IPFS chứa diễn giải lâm sàng

        IAccessControl.AccessLevel requiredLevel; // Mức quyền tối thiểu để đọc record
        uint64 createdAt;  // Timestamp tạo record (unix seconds)
        uint64 updatedAt;  // Timestamp cập nhật gần nhất
        bool active;       // false nếu record bị vô hiệu hóa (soft delete)
    }

    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice Contract AccountManager dùng để xác thực role người gọi.
    IAccountManagerForEHR public immutable accountManager;

    /// @notice Contract AccessControl dùng để kiểm tra quyền truy cập bệnh nhân.
    IAccessControl public immutable accessControl;

    /// @notice ID tiếp theo sẽ được gán khi tạo record mới. Bắt đầu từ 1.
    uint256 public nextRecordId = 1;

    /// @notice Lưu trữ record theo recordId.
    mapping(uint256 => Record) private records;

    /// @notice Lưu danh sách recordId thuộc về từng bệnh nhân.
    /// @dev Dùng để lấy toàn bộ lịch sử hồ sơ của một bệnh nhân.
    mapping(address => uint256[]) private patientRecordIds;

    // =========================================================================
    // Events — audit trail on-chain
    // =========================================================================

    /// @notice Phát ra khi bác sĩ tạo lab order mới.
    event RecordAdded(
        uint256 indexed recordId,
        address indexed patient,
        address indexed author,
        bytes32 contentHash,
        string ipfsHash,
        uint256 timestamp
    );

    /// @notice Phát ra khi trạng thái record thay đổi.
    event RecordStatusUpdated(
        uint256 indexed recordId,
        RecordStatus status,
        uint256 timestamp
    );

    /// @notice Phát ra khi orderHash hoặc labResultHash được cập nhật.
    event RecordUpdated(
        uint256 indexed recordId,
        bytes32 contentHash,
        string ipfsHash,
        uint256 timestamp
    );

    // =========================================================================
    // Custom Errors
    // =========================================================================

    error InvalidAddress();          // Địa chỉ zero address
    error NotFound();                // Record không tồn tại hoặc đã bị vô hiệu hóa
    error AccessDenied();            // Không đủ quyền truy cập
    error InvalidHash();             // Hash rỗng (bytes32(0))
    error InvalidIpfs();             // IPFS hash rỗng
    error InvalidLevel();            // requiredLevel không khớp với recordType
    error InvalidRole();             // Người gọi không có role phù hợp
    error InvalidStatusTransition(); // Chuyển trạng thái không hợp lệ
    error NotAuthor();               // Người gọi không phải tác giả của record

    // =========================================================================
    // Modifiers
    // =========================================================================

    /// @dev Kiểm tra địa chỉ khác zero address.
    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    /// @dev Kiểm tra record tồn tại và đang active.
    modifier recordExists(uint256 recordId) {
        if (records[recordId].id == 0 || !records[recordId].active) revert NotFound();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Khởi tạo contract với địa chỉ của AccountManager và AccessControl.
    /// @dev Hai địa chỉ này là immutable — không thể thay đổi sau khi deploy.
    ///      Nếu cần đổi logic AccountManager hoặc AccessControl, phải deploy lại EHRManager.
    /// @param accountManagerAddress Địa chỉ contract AccountManager đã deploy.
    /// @param accessControlAddress Địa chỉ contract AccessControl đã deploy.
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

    /// @notice Bác sĩ tạo lab order mới cho bệnh nhân — status bắt đầu là ORDERED.
    /// @dev Yêu cầu:
    ///      - msg.sender phải là bác sĩ ACTIVE.
    ///      - patient phải là bệnh nhân ACTIVE.
    ///      - Bác sĩ phải được bệnh nhân cấp quyền từ AccessControl trước.
    ///      - requiredLevel phải khớp với giá trị do _requiredLevelForType() tính.
    ///        (Tránh caller tự hạ quyền xuống thấp hơn mức cần thiết.)
    /// @param patient Địa chỉ ví bệnh nhân.
    /// @param recordType Loại xét nghiệm — chỉ dùng GENERAL, HIV_TEST, DIABETES_TEST, LAB_RESULT.
    /// @param requiredLevel Mức quyền truy cập — phải khớp với recordType.
    /// @param orderHash keccak256 của metadata lab order (tính ở backend trước khi gọi).
    /// @param orderIpfsHash Địa chỉ IPFS chứa nội dung lab order.
    /// @return id ID của record vừa tạo.
    function addRecord(
        address patient,
        RecordType recordType,
        IAccessControl.AccessLevel requiredLevel,
        bytes32 orderHash,
        string calldata orderIpfsHash
    ) external validAddress(patient) returns (uint256) {
        if (!accountManager.isDoctor(msg.sender))  revert InvalidRole();
        if (!accountManager.isPatient(patient))     revert InvalidRole();
        if (orderHash == bytes32(0))                revert InvalidHash();
        if (bytes(orderIpfsHash).length == 0)       revert InvalidIpfs();

        // Ép requiredLevel theo recordType để chặn caller tự hạ quyền truy cập
        IAccessControl.AccessLevel expectedLevel = _requiredLevelForType(recordType);
        if (requiredLevel != expectedLevel) revert InvalidLevel();

        // Bác sĩ phải được bệnh nhân cấp quyền trước (qua AccessControl.grantAccess)
        if (!accessControl.checkAccessLevel(patient, msg.sender, expectedLevel)) revert AccessDenied();

        uint256 id = nextRecordId++;

        records[id] = Record({
            id:                     id,
            patient:                patient,
            author:                 msg.sender,
            recordType:             recordType,
            status:                 RecordStatus.ORDERED,
            orderHash:              orderHash,
            orderIpfsHash:          orderIpfsHash,
            labResultHash:          bytes32(0),    // Chưa có kết quả lab
            labResultIpfsHash:      "",
            interpretationHash:     bytes32(0),    // Chưa có diễn giải
            interpretationIpfsHash: "",
            requiredLevel:          expectedLevel,
            createdAt:              uint64(block.timestamp),
            updatedAt:              uint64(block.timestamp),
            active:                 true
        });

        patientRecordIds[patient].push(id);

        emit RecordAdded(id, patient, msg.sender, orderHash, orderIpfsHash, block.timestamp);
        return id;
    }

    // =========================================================================
    // Doctor: Cập nhật order proof
    // =========================================================================

    /// @notice Bác sĩ cập nhật nội dung lab order — chỉ được khi status còn ORDERED.
    /// @dev Sau khi bệnh nhân consent (CONSENTED), order bị khóa, không sửa được nữa.
    ///      Chỉ tác giả (author) của record mới được gọi hàm này.
    /// @param recordId ID của record cần cập nhật.
    /// @param newHash keccak256 mới của metadata lab order đã chỉnh sửa.
    /// @param newIpfsHash Địa chỉ IPFS mới chứa nội dung đã chỉnh sửa.
    function updateOrderProof(
        uint256 recordId,
        bytes32 newHash,
        string calldata newIpfsHash
    ) external recordExists(recordId) {
        Record storage r = records[recordId];

        if (r.author != msg.sender)             revert NotAuthor();
        if (newHash == bytes32(0))              revert InvalidHash();
        if (bytes(newIpfsHash).length == 0)     revert InvalidIpfs();
        // Chỉ cho phép sửa khi bệnh nhân chưa consent
        if (r.status != RecordStatus.ORDERED)   revert InvalidStatusTransition();

        r.orderHash     = newHash;
        r.orderIpfsHash = newIpfsHash;
        r.updatedAt     = uint64(block.timestamp);

        emit RecordUpdated(recordId, newHash, newIpfsHash, block.timestamp);
    }

    // =========================================================================
    // Lab Tech: Post kết quả kỹ thuật
    // =========================================================================

    /// @notice Lab tech post kết quả xét nghiệm kỹ thuật — hash bị lock ngay sau khi ghi.
    /// @dev Yêu cầu:
    ///      - msg.sender phải là lab tech ACTIVE.
    ///      - Record phải thuộc nhóm lab (HIV_TEST, DIABETES_TEST, LAB_RESULT, GENERAL).
    ///      - Record phải đang ở trạng thái IN_PROGRESS.
    ///      Sau khi gọi hàm này, labResultHash không thể bị ghi đè bởi bất kỳ ai.
    ///      orderHash vẫn giữ nguyên — không bị chạm đến.
    /// @param recordId ID của record cần post kết quả.
    /// @param labResultHash keccak256 của kết quả kỹ thuật (tính ở backend).
    /// @param labResultIpfsHash Địa chỉ IPFS chứa file kết quả kỹ thuật.
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
        if (bytes(labResultIpfsHash).length == 0)   revert InvalidIpfs();

        // Ghi vào field riêng — orderHash KHÔNG bị chạm
        // Sau dòng này labResultHash bị lock, không có hàm nào ghi đè được
        r.labResultHash     = labResultHash;
        r.labResultIpfsHash = labResultIpfsHash;
        r.status            = RecordStatus.RESULT_POSTED;
        r.updatedAt         = uint64(block.timestamp);

        emit RecordUpdated(recordId, labResultHash, labResultIpfsHash, block.timestamp);
        emit RecordStatusUpdated(recordId, RecordStatus.RESULT_POSTED, block.timestamp);
    }

    // =========================================================================
    // Doctor: Thêm diễn giải lâm sàng
    // =========================================================================

    /// @notice Bác sĩ thêm diễn giải lâm sàng sau khi có kết quả lab.
    /// @dev Yêu cầu:
    ///      - msg.sender phải là bác sĩ ACTIVE.
    ///      - Record phải đang ở RESULT_POSTED.
    ///      - Bác sĩ phải có quyền truy cập bệnh nhân (checkAccessLevel).
    ///      Nội dung diễn giải lưu off-chain (IPFS), on-chain chỉ lưu hash để bảo mật.
    ///      labResultHash KHÔNG bị chạm — 2 lớp proof hoàn toàn độc lập.
    /// @param recordId ID của record cần thêm diễn giải.
    /// @param interpretationHash keccak256 của nội dung diễn giải lâm sàng.
    /// @param interpretationIpfsHash Địa chỉ IPFS chứa nội dung diễn giải.
    function addClinicalInterpretation(
        uint256 recordId,
        bytes32 interpretationHash,
        string calldata interpretationIpfsHash
    ) external recordExists(recordId) {
        Record storage r = records[recordId];

        if (!accountManager.isDoctor(msg.sender))    revert InvalidRole();
        if (r.status != RecordStatus.RESULT_POSTED)  revert InvalidStatusTransition();
        if (interpretationHash == bytes32(0))        revert InvalidHash();
        if (bytes(interpretationIpfsHash).length == 0) revert InvalidIpfs();

        // Bác sĩ phải có quyền truy cập bệnh nhân mới được thêm diễn giải
        if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();

        // Ghi vào field riêng — labResultHash và orderHash KHÔNG bị chạm
        r.interpretationHash     = interpretationHash;
        r.interpretationIpfsHash = interpretationIpfsHash;
        r.status                 = RecordStatus.DOCTOR_REVIEWED;
        r.updatedAt              = uint64(block.timestamp);

        emit RecordStatusUpdated(recordId, RecordStatus.DOCTOR_REVIEWED, block.timestamp);
    }

    // =========================================================================
    // State Machine: Các transition còn lại
    // =========================================================================

    /// @notice Xử lý các chuyển trạng thái không gắn với việc ghi dữ liệu:
    ///         ORDERED → CONSENTED (bệnh nhân đồng ý)
    ///         CONSENTED → IN_PROGRESS (lab tech tiếp nhận)
    ///         DOCTOR_REVIEWED → COMPLETE (bác sĩ chốt hồ sơ)
    /// @dev Các transition gắn với ghi dữ liệu (RESULT_POSTED, DOCTOR_REVIEWED)
    ///      được xử lý trực tiếp trong postLabResult() và addClinicalInterpretation().
    /// @param recordId ID của record cần chuyển trạng thái.
    /// @param newStatus Trạng thái mới muốn chuyển đến.
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
        // CONSENTED → IN_PROGRESS: Chỉ lab tech, chỉ với record xét nghiệm
        else if (oldStatus == RecordStatus.CONSENTED && newStatus == RecordStatus.IN_PROGRESS) {
            if (!accountManager.isLabTech(msg.sender)) revert InvalidRole();
            // Ngăn lab tech tiếp nhận record không thuộc phạm vi xét nghiệm
            if (!_isLabRecord(r.recordType))            revert InvalidRole();
        }
        // DOCTOR_REVIEWED → COMPLETE: Bác sĩ chốt hồ sơ, phải có quyền truy cập
        else if (oldStatus == RecordStatus.DOCTOR_REVIEWED && newStatus == RecordStatus.COMPLETE) {
            if (!isDoctor) revert InvalidRole();
            // Đảm bảo đúng bác sĩ được bệnh nhân cấp quyền mới được chốt
            if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();
        }
        else {
            // Mọi transition không có trong danh sách trên đều bị từ chối
            revert InvalidStatusTransition();
        }

        r.status    = newStatus;
        r.updatedAt = uint64(block.timestamp);
        emit RecordStatusUpdated(recordId, newStatus, block.timestamp);
    }

    // =========================================================================
    // Views — Truy vấn dữ liệu
    // =========================================================================

    /// @notice Lấy toàn bộ thông tin của một record.
    /// @dev Bệnh nhân sở hữu record được đọc tự do.
    ///      Người khác (bác sĩ, lab tech) cần có grant hợp lệ từ AccessControl.
    /// @param recordId ID của record cần đọc.
    /// @return Struct Record đầy đủ bao gồm 3 lớp hash và metadata.
    function getRecord(uint256 recordId)
        external view
        recordExists(recordId)
        returns (Record memory)
    {
        Record memory r = records[recordId];

        // Bệnh nhân luôn được đọc hồ sơ của chính mình
        if (msg.sender == r.patient) return r;

        // Người khác cần có quyền truy cập hợp lệ
        if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();

        return r;
    }

    /// @notice Lấy danh sách ID tất cả record thuộc về một bệnh nhân.
    /// @dev Bệnh nhân và admin được đọc tự do.
    ///      Bác sĩ/lab tech cần có grant FULL trở lên từ AccessControl.
    /// @param patient Địa chỉ ví bệnh nhân cần tra cứu.
    /// @return Mảng các recordId thuộc bệnh nhân.
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

    /// @notice Kiểm tra toàn vẹn dữ liệu bằng cách so sánh hash on-chain với hash tính lại.
    /// @dev Chỉ bệnh nhân, admin, hoặc người có quyền truy cập mới được verify.
    ///      Tránh "public verify" tự do vì kẻ tấn công có thể dò thông tin gián tiếp.
    /// @param recordId ID của record cần verify.
    /// @param computedHash Hash tính lại ở backend từ file thực tế.
    /// @param hashType Lớp hash cần verify: 0=orderHash, 1=labResultHash, 2=interpretationHash.
    /// @return true nếu hash khớp (dữ liệu toàn vẹn), false nếu không khớp (có thể bị tamper).
    function verifyRecordHash(
        uint256 recordId,
        bytes32 computedHash,
        uint8 hashType
    ) external view recordExists(recordId) returns (bool) {
        Record memory r = records[recordId];

        // Kiểm tra quyền truy cập trước khi cho phép verify
        if (msg.sender != r.patient && !accountManager.isAdmin(msg.sender)) {
            if (!accessControl.checkAccessLevel(r.patient, msg.sender, r.requiredLevel)) revert AccessDenied();
        }

        // So sánh với đúng lớp hash được yêu cầu
        if (hashType == 0) return r.orderHash == computedHash;           // Lớp 1: order
        if (hashType == 1) return r.labResultHash == computedHash;       // Lớp 2: lab result
        if (hashType == 2) return r.interpretationHash == computedHash;  // Lớp 3: interpretation
        revert InvalidHash(); // hashType không hợp lệ
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// @dev Kiểm tra record có thuộc nhóm xét nghiệm lab tech được phép thao tác không.
    ///      Dùng trong postLabResult() và updateRecordStatus() để ngăn over-privilege.
    /// @param recordType Loại record cần kiểm tra.
    /// @return true nếu là lab record, false nếu không phải.
    function _isLabRecord(RecordType recordType) internal pure returns (bool) {
        return recordType == RecordType.HIV_TEST
            || recordType == RecordType.DIABETES_TEST
            || recordType == RecordType.LAB_RESULT
            || recordType == RecordType.GENERAL;
    }

    /// @dev Tính mức quyền truy cập tối thiểu theo loại record.
    ///      HIV_TEST yêu cầu SENSITIVE vì là dữ liệu cực kỳ nhạy cảm.
    ///      Các loại còn lại yêu cầu FULL — quyền truy cập nghiệp vụ thông thường.
    /// @param recordType Loại record cần tính mức quyền.
    /// @return Mức AccessLevel tương ứng.
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