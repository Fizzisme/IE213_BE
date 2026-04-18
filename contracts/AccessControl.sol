// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAccountManager
 * @notice Interface dùng để kiểm tra vai trò (role) của các địa chỉ trong hệ thống.
 *         Contract AccessControl không quản lý tài khoản trực tiếp mà uỷ quyền
 *         việc xác thực vai trò sang AccountManager — giúp tách biệt trách nhiệm
 *         và dễ nâng cấp từng module độc lập.
 */
interface IAccountManager {
    /// @notice Trả về true nếu `account` được đăng ký là bệnh nhân (patient).
    function isPatient(address account) external view returns (bool);

    /// @notice Trả về true nếu `account` được đăng ký là bác sĩ (doctor).
    function isDoctor(address account) external view returns (bool);

    /// @notice Trả về true nếu `account` được đăng ký là kỹ thuật viên xét nghiệm (lab technician).
    function isLabTech(address account) external view returns (bool);
}

/**
 * @title AccessControl
 * @notice Quản lý quyền truy cập vào hồ sơ y tế của bệnh nhân.
 *
 * Luồng hoạt động chính:
 *   1. Bệnh nhân (patient) cấp quyền cho bác sĩ hoặc kỹ thuật viên qua `grantAccess`.
 *   2. Bệnh nhân có thể chỉnh sửa quyền đang hoạt động qua `updateAccess`.
 *   3. Bệnh nhân có thể thu hồi quyền bất kỳ lúc nào qua `revokeAccess`.
 *   4. Bên thứ ba gọi `checkAccessLevel` để xác minh quyền trước khi truy cập dữ liệu.
 *
 * Mô hình phân quyền (AccessLevel):
 *   - NONE      : Không yêu cầu quyền gì — luôn được phép.
 *   - EMERGENCY : Dành cho bác sĩ trong tình huống khẩn cấp — không cần grant,
 *                 chỉ cần địa chỉ được đăng ký là doctor trong AccountManager.
 *   - FULL      : Quyền truy cập đầy đủ vào hồ sơ, cần bệnh nhân cấp trước.
 *   - SENSITIVE : Quyền truy cập dữ liệu nhạy cảm (cấp cao hơn FULL),
 *                 cần bệnh nhân cấp trước.
 *
 * Lưu ý thiết kế:
 *   - Chỉ bệnh nhân mới có thể cấp/sửa/thu hồi quyền (modifier onlyPatient).
 *   - Chỉ doctor hoặc labTech mới có thể nhận quyền (không cấp cho patient khác).
 *   - Grant có thể vô thời hạn (durationHours == 0) hoặc có thời hạn cố định.
 *   - Grant đã hết hạn được coi như không tồn tại — không thể update hay revoke.
 *
 * @dev Contract sử dụng IAccountManager (immutable) để kiểm tra vai trò.
 *      Không lưu danh sách accessor theo patient → cần event log để enumerate off-chain.
 */
contract AccessControl {

    // =========================================================================
    // Enums & Structs
    // =========================================================================

    /**
     * @notice Các mức độ quyền truy cập, sắp xếp tăng dần theo đặc quyền.
     *
     * So sánh dùng uint8 cast: uint8(SENSITIVE) > uint8(FULL) > uint8(EMERGENCY) > uint8(NONE).
     * Trong checkAccessLevel, chỉ FULL và SENSITIVE được so sánh trực tiếp với grant.level.
     * EMERGENCY được xử lý riêng — không dùng grant, chỉ kiểm tra isDoctor().
     */
    enum AccessLevel {
        NONE,       // 0 — không yêu cầu quyền, luôn pass
        EMERGENCY,  // 1 — chỉ bác sĩ, không cần grant (xử lý riêng trong checkAccessLevel)
        FULL,       // 2 — truy cập đầy đủ, cần grant từ bệnh nhân
        SENSITIVE   // 3 — truy cập dữ liệu nhạy cảm, cần grant từ bệnh nhân
    }

    /**
     * @notice Thông tin về một lần cấp quyền (grant) từ bệnh nhân cho accessor.
     *
     * @param level      Mức quyền được cấp (FULL hoặc SENSITIVE).
     * @param grantedAt  Timestamp (Unix) lúc cấp hoặc lúc cập nhật gần nhất.
     * @param expiresAt  Timestamp hết hạn. Bằng 0 = vô thời hạn; > 0 = có thời hạn.
     * @param isActive   true nếu grant đang hoạt động (chưa bị revoke).
     *
     * @dev Khi grant bị revoke, isActive = false và expiresAt = block.timestamp tại thời điểm revoke.
     *      Khi grant hết hạn tự nhiên (expiresAt != 0 && block.timestamp > expiresAt),
     *      isActive vẫn là true nhưng _isExpired() trả về true — grant coi như vô hiệu.
     */
    struct AccessGrant {
        AccessLevel level;
        uint64 grantedAt;
        uint64 expiresAt;
        bool isActive;
    }

    // =========================================================================
    // State variables
    // =========================================================================

    /// @notice AccountManager contract dùng để xác minh vai trò.
    ///         Immutable — được set một lần trong constructor, không thể thay đổi.
    IAccountManager private immutable accountManager;

    /**
     * @notice Lưu trữ tất cả grant: patient address → accessor address → AccessGrant.
     * @dev    Mỗi cặp (patient, accessor) chỉ lưu một grant duy nhất (ghi đè khi grant mới).
     *         Không có danh sách accessor theo patient — cần query event log off-chain.
     */
    mapping(address => mapping(address => AccessGrant)) private accessGrants;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Phát ra khi bệnh nhân cấp quyền mới cho một accessor.
    /// @param patient   Địa chỉ bệnh nhân cấp quyền.
    /// @param accessor  Địa chỉ được nhận quyền (doctor hoặc labTech).
    /// @param level     Mức quyền được cấp.
    /// @param expiresAt Thời điểm hết hạn (0 = vô thời hạn).
    /// @param timestamp Block timestamp tại thời điểm cấp.
    event AccessGranted(address indexed patient, address indexed accessor, AccessLevel level, uint64 expiresAt, uint256 timestamp);

    /// @notice Phát ra khi bệnh nhân cập nhật quyền đang hoạt động của một accessor.
    event AccessUpdated(address indexed patient, address indexed accessor, AccessLevel level, uint64 expiresAt, uint256 timestamp);

    /// @notice Phát ra khi bệnh nhân thu hồi quyền của một accessor.
    event AccessRevoked(address indexed patient, address indexed accessor, uint256 timestamp);

    /**
     * @notice Phát ra khi checkMyAccessAndLog được gọi (tạo audit trail on-chain).
     * @dev    CHÚ Ý: Hàm này tốn gas do write state (emit event). Chỉ dùng khi cần
     *         audit log on-chain. Dùng checkMyAccessLevel (view) cho các check thông thường.
     *         Có thể bị gọi liên tục để flood event log — cân nhắc thêm rate-limit nếu cần.
     */
    event AccessChecked(address indexed patient, address indexed accessor, AccessLevel requiredLevel, bool allowed, uint256 timestamp);

    // =========================================================================
    // Custom errors
    // =========================================================================

    /// @notice Địa chỉ truyền vào là address(0).
    error InvalidAddress();

    /// @notice msg.sender không phải bệnh nhân — chỉ bệnh nhân mới được thao tác grant.
    error NotAPatient();

    /// @notice Mức quyền không hợp lệ. Chỉ FULL và SENSITIVE mới được dùng trong grant.
    error InvalidAccessLevel();

    /// @notice Accessor không phải doctor hoặc labTech.
    error TargetMustBeDoctorOrLabTech();

    /// @notice Đã tồn tại grant còn hoạt động và chưa hết hạn. Dùng updateAccess để sửa.
    error AlreadyHasAccess();

    /// @notice Grant không tồn tại, đã bị revoke, hoặc đã hết hạn.
    error AccessNotFound();

    // =========================================================================
    // Modifiers
    // =========================================================================

    /**
     * @notice Kiểm tra địa chỉ không phải address(0).
     * @param account Địa chỉ cần kiểm tra.
     */
    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    /**
     * @notice Chỉ cho phép bệnh nhân (theo AccountManager) gọi hàm.
     * @dev    Dùng cho grantAccess, updateAccess, revokeAccess.
     */
    modifier onlyPatient() {
        if (!accountManager.isPatient(msg.sender)) revert NotAPatient();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    /**
     * @notice Khởi tạo contract với địa chỉ của AccountManager.
     * @param accountManagerAddress Địa chỉ của IAccountManager đã deploy. Không được là address(0).
     */
    constructor(address accountManagerAddress) validAddress(accountManagerAddress) {
        accountManager = IAccountManager(accountManagerAddress);
    }

    // =========================================================================
    // Write functions — chỉ bệnh nhân được gọi
    // =========================================================================

    /**
     * @notice Bệnh nhân cấp quyền truy cập cho một doctor hoặc labTech.
     *
     * Điều kiện:
     *   - msg.sender phải là patient (onlyPatient).
     *   - accessor phải là doctor hoặc labTech.
     *   - level phải là FULL hoặc SENSITIVE (NONE và EMERGENCY không được grant thủ công).
     *   - Không tồn tại grant active & chưa hết hạn cho cặp (msg.sender, accessor).
     *     Nếu grant cũ đã hết hạn hoặc đã bị revoke, cho phép grant mới (ghi đè).
     *
     * @param accessor      Địa chỉ nhận quyền (phải là doctor hoặc labTech).
     * @param level         Mức quyền cấp: FULL (2) hoặc SENSITIVE (3).
     * @param durationHours Thời hạn tính bằng giờ. 0 = vô thời hạn.
     *
     * @dev Grant mới ghi đè hoàn toàn lên AccessGrant cũ trong mapping (kể cả grant đã hết hạn).
     */
    function grantAccess(address accessor, AccessLevel level, uint64 durationHours)
        external
        onlyPatient
        validAddress(accessor)
    {
        if (!_isDoctorOrLab(accessor)) revert TargetMustBeDoctorOrLabTech();

        // Chỉ FULL và SENSITIVE mới được cấp thủ công.
        // EMERGENCY là quyền tự động theo vai trò doctor — không lưu trong grant.
        // NONE luôn được phép — không cần grant.
        if (level != AccessLevel.FULL && level != AccessLevel.SENSITIVE) revert InvalidAccessLevel();

        // Chặn cấp trùng: nếu grant cũ vẫn còn hiệu lực, yêu cầu dùng updateAccess.
        // Grant đã hết hạn hoặc đã revoke (isActive = false) được phép ghi đè.
        AccessGrant storage existing = accessGrants[msg.sender][accessor];
        if (existing.isActive && !_isExpired(existing.expiresAt)) revert AlreadyHasAccess();

        // Tính expiresAt: 0 = vô thời hạn; > 0 = block.timestamp + durationHours * 3600.
        // Dùng uint256 trung gian để tránh overflow trước khi cast về uint64.
        uint64 expiresAt = durationHours == 0
            ? 0
            : uint64(block.timestamp + (uint256(durationHours) * 1 hours));

        accessGrants[msg.sender][accessor] = AccessGrant({
            level:     level,
            grantedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            isActive:  true
        });

        emit AccessGranted(msg.sender, accessor, level, expiresAt, block.timestamp);
    }

    /**
     * @notice Bệnh nhân cập nhật mức quyền hoặc thời hạn của một grant đang hoạt động.
     *
     * Điều kiện:
     *   - msg.sender phải là patient.
     *   - accessor phải là doctor hoặc labTech.
     *   - level phải là FULL hoặc SENSITIVE.
     *   - Grant phải đang isActive = true VÀ chưa hết hạn.
     *     Nếu grant đã hết hạn → revert AccessNotFound (cần grantAccess mới thay vì update).
     *
     * @param accessor      Địa chỉ accessor cần cập nhật quyền.
     * @param level         Mức quyền mới: FULL (2) hoặc SENSITIVE (3).
     * @param durationHours Thời hạn mới tính từ block.timestamp. 0 = vô thời hạn.
     *
     * @dev Cập nhật grantedAt về block.timestamp hiện tại (reset timestamp).
     *      Không tạo grant mới — chỉ sửa các field của grant hiện có trong storage.
     */
    function updateAccess(address accessor, AccessLevel level, uint64 durationHours)
        external
        onlyPatient
        validAddress(accessor)
    {
        if (!_isDoctorOrLab(accessor)) revert TargetMustBeDoctorOrLabTech();
        if (level != AccessLevel.FULL && level != AccessLevel.SENSITIVE) revert InvalidAccessLevel();

        AccessGrant storage grant = accessGrants[msg.sender][accessor];

        // Không cho phép update grant đã revoke hoặc chưa tồn tại.
        if (!grant.isActive) revert AccessNotFound();

        // Không cho phép update grant đã hết hạn — cần grantAccess để tạo grant mới.
        // Thiết kế này tránh "hồi sinh" grant cũ một cách ngầm định.
        if (_isExpired(grant.expiresAt)) revert AccessNotFound();

        grant.level     = level;
        grant.grantedAt = uint64(block.timestamp); // Reset timestamp theo lần update mới nhất
        grant.expiresAt = durationHours == 0
            ? 0
            : uint64(block.timestamp + (uint256(durationHours) * 1 hours));

        emit AccessUpdated(msg.sender, accessor, level, grant.expiresAt, block.timestamp);
    }

    /**
     * @notice Bệnh nhân thu hồi quyền truy cập của một accessor.
     *
     * Điều kiện:
     *   - msg.sender phải là patient.
     *   - Grant phải đang isActive = true VÀ chưa hết hạn.
     *     Nếu grant đã hết hạn tự nhiên → revert AccessNotFound (không cần revoke nữa).
     *
     * @param accessor Địa chỉ accessor bị thu hồi quyền.
     *
     * @dev Sau khi revoke:
     *      - isActive = false
     *      - expiresAt = block.timestamp (thời điểm revoke)
     *      Lưu ý: nếu grant vô thời hạn (expiresAt cũ = 0), sau revoke expiresAt = block.timestamp.
     *      _isExpired() trả về false ngay tại block đó (block.timestamp > block.timestamp là false),
     *      nhưng isActive = false đã đủ để vô hiệu hoá grant. Không ảnh hưởng đến tính đúng đắn.
     */
    function revokeAccess(address accessor)
        external
        onlyPatient
        validAddress(accessor)
    {
        AccessGrant storage grant = accessGrants[msg.sender][accessor];

        // Không cho phép revoke grant đã bị revoke hoặc chưa tồn tại.
        if (!grant.isActive) revert AccessNotFound();

        // Không cho phép revoke grant đã hết hạn tự nhiên — đã vô hiệu, không cần thao tác thêm.
        if (_isExpired(grant.expiresAt)) revert AccessNotFound();

        grant.isActive  = false;
        grant.expiresAt = uint64(block.timestamp); // Ghi lại thời điểm revoke để audit

        emit AccessRevoked(msg.sender, accessor, block.timestamp);
    }

    // =========================================================================
    // Read functions
    // =========================================================================

    /**
     * @notice Kiểm tra xem accessor có đủ quyền requiredLevel để truy cập dữ liệu của patient không.
     *
     * Logic theo từng mức:
     *   - NONE      : Luôn trả về true (không yêu cầu quyền gì).
     *   - EMERGENCY : Trả về true nếu accessor là doctor — KHÔNG cần grant.
     *                 Đây là quyền khẩn cấp tự động theo vai trò, bỏ qua mọi grant.
     *   - FULL / SENSITIVE: Cần accessor là doctor hoặc labTech, grant phải isActive,
     *                       chưa hết hạn, và grant.level >= requiredLevel.
     *
     * @param patient       Địa chỉ bệnh nhân sở hữu dữ liệu.
     * @param accessor      Địa chỉ muốn truy cập.
     * @param requiredLevel Mức quyền tối thiểu cần có.
     * @return bool true nếu accessor có đủ quyền, false nếu không.
     *
     * @dev Hàm public view — không tốn gas khi gọi off-chain.
     *      Trả về false thay vì revert khi địa chỉ không hợp lệ — phù hợp cho điều kiện kiểm tra.
     */
    function checkAccessLevel(address patient, address accessor, AccessLevel requiredLevel)
        public
        view
        returns (bool)
    {
        // Bảo vệ cơ bản: tránh check với địa chỉ rỗng
        if (patient == address(0) || accessor == address(0)) return false;

        // NONE: không yêu cầu bất kỳ quyền gì
        if (requiredLevel == AccessLevel.NONE) return true;

        // EMERGENCY: chỉ yêu cầu accessor là doctor — không cần grant.
        // Thiết kế có chủ ý: bác sĩ luôn có thể truy cập khẩn cấp dù chưa được bệnh nhân cấp quyền.
        if (requiredLevel == AccessLevel.EMERGENCY) {
            return accountManager.isDoctor(accessor);
        }

        // FULL / SENSITIVE: accessor phải là doctor hoặc labTech
        if (!_isDoctorOrLab(accessor)) return false;

        AccessGrant memory grant = accessGrants[patient][accessor];

        // Grant phải đang hoạt động (chưa bị revoke)
        if (!grant.isActive) return false;

        // Grant chưa hết hạn
        if (_isExpired(grant.expiresAt)) return false;

        // So sánh mức quyền: grant.level phải >= requiredLevel
        // Vì FULL = 2, SENSITIVE = 3: uint8 cast cho phép so sánh thứ tự.
        return uint8(grant.level) >= uint8(requiredLevel);
    }

    /**
     * @notice Cho phép msg.sender tự kiểm tra quyền của mình với một patient.
     *
     * @param patient       Địa chỉ bệnh nhân cần kiểm tra.
     * @param requiredLevel Mức quyền tối thiểu.
     * @return bool true nếu msg.sender có đủ quyền.
     *
     * @dev Wrapper tiện lợi của checkAccessLevel — không emit event, không tốn gas viết.
     *      Dùng cho check thông thường trong contract khác hoặc off-chain call.
     */
    function checkMyAccessLevel(address patient, AccessLevel requiredLevel)
        external
        view
        returns (bool)
    {
        return checkAccessLevel(patient, msg.sender, requiredLevel);
    }

    /**
     * @notice Kiểm tra quyền của msg.sender và ghi nhật ký audit lên on-chain (emit event).
     *
     * @param patient       Địa chỉ bệnh nhân cần kiểm tra.
     * @param requiredLevel Mức quyền tối thiểu.
     * @return bool true nếu msg.sender có đủ quyền.
     *
     * @dev CẢNH BÁO — TỐN GAS: Hàm này là non-view (emit event = write state).
     *      Chỉ dùng khi thực sự cần audit trail on-chain (ví dụ: truy cập dữ liệu nhạy cảm cần log).
     *      Cho các kiểm tra thông thường, dùng checkMyAccessLevel (view) để tiết kiệm gas.
     *
     *      TIỀM ẨN SPAM: Bất kỳ địa chỉ nào cũng có thể gọi hàm này liên tục để flood event log.
     *      Cân nhắc thêm rate-limit hoặc kiểm soát truy cập nếu cần bảo vệ log.
     */
    function checkMyAccessAndLog(address patient, AccessLevel requiredLevel)
        external
        returns (bool)
    {
        bool allowed = checkAccessLevel(patient, msg.sender, requiredLevel);
        emit AccessChecked(patient, msg.sender, requiredLevel, allowed, block.timestamp);
        return allowed;
    }

    /**
     * @notice Trả về toàn bộ thông tin AccessGrant giữa patient và accessor.
     *
     * @param patient  Địa chỉ bệnh nhân.
     * @param accessor Địa chỉ accessor cần tra cứu.
     * @return level     Mức quyền được cấp.
     * @return grantedAt Timestamp lúc cấp hoặc cập nhật gần nhất.
     * @return expiresAt Timestamp hết hạn (0 = vô thời hạn).
     * @return isActive  true nếu grant chưa bị revoke (không kiểm tra expiry ở đây).
     *
     * @dev Trả về struct zero nếu không tồn tại grant (level = NONE, timestamps = 0, isActive = false).
     *      Hàm này không kiểm tra expiry — gọi isGrantValid nếu cần biết grant còn hiệu lực không.
     */
    function getAccessGrant(address patient, address accessor)
        external
        view
        returns (AccessLevel level, uint64 grantedAt, uint64 expiresAt, bool isActive)
    {
        AccessGrant memory grant = accessGrants[patient][accessor];
        return (grant.level, grant.grantedAt, grant.expiresAt, grant.isActive);
    }

    /**
     * @notice Kiểm tra nhanh grant giữa patient và accessor có còn hiệu lực không.
     *
     * @param patient  Địa chỉ bệnh nhân.
     * @param accessor Địa chỉ accessor.
     * @return bool true nếu grant isActive = true VÀ chưa hết hạn.
     *
     * @dev Không kiểm tra vai trò hay mức quyền — chỉ kiểm tra trạng thái tồn tại/còn hạn.
     *      Dùng checkAccessLevel nếu cần kiểm tra đủ điều kiện truy cập thực sự.
     */
    function isGrantValid(address patient, address accessor)
        external
        view
        returns (bool)
    {
        AccessGrant memory grant = accessGrants[patient][accessor];
        return grant.isActive && !_isExpired(grant.expiresAt);
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /**
     * @notice Kiểm tra địa chỉ có phải doctor hoặc labTech không.
     * @param account Địa chỉ cần kiểm tra.
     * @return bool true nếu là doctor hoặc labTech.
     *
     * @dev Dùng trong grantAccess, updateAccess, checkAccessLevel để lọc accessor hợp lệ.
     */
    function _isDoctorOrLab(address account) internal view returns (bool) {
        return accountManager.isDoctor(account) || accountManager.isLabTech(account);
    }

    /**
     * @notice Kiểm tra một grant có hết hạn chưa dựa trên expiresAt.
     * @param expiresAt Timestamp hết hạn (uint64).
     * @return bool true nếu đã hết hạn, false nếu còn hạn hoặc vô thời hạn.
     *
     * @dev Quy ước: expiresAt == 0 nghĩa là vô thời hạn — không bao giờ hết hạn.
     *      Sử dụng block.timestamp > expiresAt (strict greater) nên đúng block hết hạn vẫn còn hạn.
     */
    function _isExpired(uint64 expiresAt) internal view returns (bool) {
        return expiresAt != 0 && block.timestamp > expiresAt;
    }
}