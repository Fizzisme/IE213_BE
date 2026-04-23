// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAccountManager
 * @notice Interface dùng để kiểm tra vai trò (role) của các địa chỉ trong hệ thống.
 */
interface IAccountManager {
    function isPatient(address account) external view returns (bool);
    function isDoctor(address account) external view returns (bool);
    function isLabTech(address account) external view returns (bool);
}

/**
 * @title AccessControl
 * @notice Quản lý quyền truy cập vào hồ sơ y tế của bệnh nhân.
 *
 * Luồng hoạt động chính:
 *   1. Bệnh nhân cấp quyền cho bác sĩ hoặc kỹ thuật viên qua grantAccess.
 *   2. Bệnh nhân có thể chỉnh sửa quyền đang hoạt động qua updateAccess.
 *   3. Bệnh nhân có thể thu hồi quyền bất kỳ lúc nào qua revokeAccess.
 *   4. Bên thứ ba gọi checkAccessLevel để xác minh quyền trước khi truy cập dữ liệu.
 *
 * Mô hình phân quyền (AccessLevel):
 *   - NONE      : Không yêu cầu quyền gì — luôn được phép.
 *   - EMERGENCY : Dành cho bác sĩ trong tình huống khẩn cấp.
 *   - FULL      : Quyền truy cập đầy đủ, cần bệnh nhân cấp trước.
 *   - SENSITIVE : Quyền truy cập dữ liệu nhạy cảm, cần bệnh nhân cấp trước.
 *
 * Changelog (Fixed):
 * - [FIX #4] checkMyAccessAndLog: thêm rate limit 60 giây để chặn flood event log.
 *   Thêm state: lastAccessCheckAt mapping + ACCESS_CHECK_COOLDOWN constant.
 *   Thêm custom error: RateLimitExceeded.
 */
contract AccessControl {

    // =========================================================================
    // Enums & Structs
    // =========================================================================

    /**
     * @notice Các mức độ quyền truy cập, sắp xếp tăng dần theo đặc quyền.
     */
    enum AccessLevel {
        NONE,       // 0 — không yêu cầu quyền, luôn pass
        EMERGENCY,  // 1 — chỉ bác sĩ, không cần grant
        FULL,       // 2 — truy cập đầy đủ, cần grant từ bệnh nhân
        SENSITIVE   // 3 — truy cập dữ liệu nhạy cảm, cần grant từ bệnh nhân
    }

    /**
     * @notice Thông tin về một lần cấp quyền từ bệnh nhân cho accessor.
     *
     * @param level      Mức quyền được cấp (FULL hoặc SENSITIVE).
     * @param grantedAt  Timestamp lúc cấp hoặc cập nhật gần nhất.
     * @param expiresAt  Timestamp hết hạn. 0 = vô thời hạn.
     * @param isActive   true nếu grant đang hoạt động.
     */
    struct AccessGrant {
        AccessLevel level;
        uint64 grantedAt;
        uint64 expiresAt;
        bool isActive;
    }

    // =========================================================================
    // Constants
    // =========================================================================

    /// @notice [FIX #4] Khoảng thời gian tối thiểu (giây) giữa 2 lần gọi checkMyAccessAndLog
    ///         từ cùng 1 địa chỉ. Mục đích: chặn flood event log on-chain.
    uint64 private constant ACCESS_CHECK_COOLDOWN = 60;

    // =========================================================================
    // State variables
    // =========================================================================

    /// @notice AccountManager contract dùng để xác minh vai trò. Immutable.
    IAccountManager private immutable accountManager;

    /// @notice Lưu trữ tất cả grant: patient → accessor → AccessGrant.
    mapping(address => mapping(address => AccessGrant)) private accessGrants;

    /// @notice [FIX #4] Lưu timestamp lần cuối mỗi địa chỉ gọi checkMyAccessAndLog.
    ///         Dùng để enforce rate limit và chặn flood event log.
    mapping(address => uint64) private lastAccessCheckAt;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Phát ra khi bệnh nhân cấp quyền mới cho một accessor.
    event AccessGranted(
        address indexed patient,
        address indexed accessor,
        AccessLevel level,
        uint64 expiresAt,
        uint256 timestamp
    );

    /// @notice Phát ra khi bệnh nhân cập nhật quyền của một accessor.
    event AccessUpdated(
        address indexed patient,
        address indexed accessor,
        AccessLevel level,
        uint64 expiresAt,
        uint256 timestamp
    );

    /// @notice Phát ra khi bệnh nhân thu hồi quyền của một accessor.
    event AccessRevoked(
        address indexed patient,
        address indexed accessor,
        uint256 timestamp
    );

    /**
     * @notice Phát ra khi checkMyAccessAndLog được gọi (tạo audit trail on-chain).
     * @dev Chỉ được emit tối đa 1 lần mỗi ACCESS_CHECK_COOLDOWN giây mỗi địa chỉ
     *      nhờ rate limit ở [FIX #4].
     */
    event AccessChecked(
        address indexed patient,
        address indexed accessor,
        AccessLevel requiredLevel,
        bool allowed,
        uint256 timestamp
    );

    // =========================================================================
    // Custom errors
    // =========================================================================

    error InvalidAddress();
    error NotAPatient();
    error InvalidAccessLevel();
    error TargetMustBeDoctorOrLabTech();
    error AlreadyHasAccess();
    error AccessNotFound();

    /// @notice [FIX #4] Caller gọi checkMyAccessAndLog quá nhanh — phải chờ cooldown.
    error RateLimitExceeded();

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    modifier onlyPatient() {
        if (!accountManager.isPatient(msg.sender)) revert NotAPatient();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address accountManagerAddress) validAddress(accountManagerAddress) {
        accountManager = IAccountManager(accountManagerAddress);
    }

    // =========================================================================
    // Write functions — chỉ bệnh nhân được gọi
    // =========================================================================

    /**
     * @notice Bệnh nhân cấp quyền truy cập cho một doctor hoặc labTech.
     *
     * @param accessor      Địa chỉ nhận quyền (phải là doctor hoặc labTech).
     * @param level         Mức quyền cấp: FULL (2) hoặc SENSITIVE (3).
     * @param durationHours Thời hạn tính bằng giờ. 0 = vô thời hạn.
     */
    function grantAccess(address accessor, AccessLevel level, uint64 durationHours)
        external
        onlyPatient
        validAddress(accessor)
    {
        if (!_isDoctorOrLab(accessor)) revert TargetMustBeDoctorOrLabTech();
        if (level != AccessLevel.FULL && level != AccessLevel.SENSITIVE) revert InvalidAccessLevel();

        AccessGrant storage existing = accessGrants[msg.sender][accessor];
        if (existing.isActive && !_isExpired(existing.expiresAt)) revert AlreadyHasAccess();

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
     * @param accessor      Địa chỉ accessor cần cập nhật quyền.
     * @param level         Mức quyền mới: FULL (2) hoặc SENSITIVE (3).
     * @param durationHours Thời hạn mới tính từ block.timestamp. 0 = vô thời hạn.
     */
    function updateAccess(address accessor, AccessLevel level, uint64 durationHours)
        external
        onlyPatient
        validAddress(accessor)
    {
        if (!_isDoctorOrLab(accessor)) revert TargetMustBeDoctorOrLabTech();
        if (level != AccessLevel.FULL && level != AccessLevel.SENSITIVE) revert InvalidAccessLevel();

        AccessGrant storage grant = accessGrants[msg.sender][accessor];

        if (!grant.isActive) revert AccessNotFound();
        if (_isExpired(grant.expiresAt)) revert AccessNotFound();

        grant.level     = level;
        grant.grantedAt = uint64(block.timestamp);
        grant.expiresAt = durationHours == 0
            ? 0
            : uint64(block.timestamp + (uint256(durationHours) * 1 hours));

        emit AccessUpdated(msg.sender, accessor, level, grant.expiresAt, block.timestamp);
    }

    /**
     * @notice Bệnh nhân thu hồi quyền truy cập của một accessor.
     *
     * @param accessor Địa chỉ accessor bị thu hồi quyền.
     */
    function revokeAccess(address accessor)
        external
        onlyPatient
        validAddress(accessor)
    {
        AccessGrant storage grant = accessGrants[msg.sender][accessor];

        if (!grant.isActive) revert AccessNotFound();
        if (_isExpired(grant.expiresAt)) revert AccessNotFound();

        grant.isActive  = false;
        grant.expiresAt = uint64(block.timestamp);

        emit AccessRevoked(msg.sender, accessor, block.timestamp);
    }

    // =========================================================================
    // Read functions
    // =========================================================================

    /**
     * @notice Kiểm tra quyền truy cập của accessor với patient.
     *
     * Logic:
     *   - NONE      : Luôn true.
     *   - EMERGENCY : True nếu accessor là doctor (không cần grant).
     *   - FULL/SENSITIVE: Cần grant isActive, chưa hết hạn, level >= requiredLevel.
     *
     * @param patient       Địa chỉ bệnh nhân sở hữu dữ liệu.
     * @param accessor      Địa chỉ muốn truy cập.
     * @param requiredLevel Mức quyền tối thiểu cần có.
     * @return bool true nếu accessor có đủ quyền.
     */
    function checkAccessLevel(address patient, address accessor, AccessLevel requiredLevel)
        public
        view
        returns (bool)
    {
        if (patient == address(0) || accessor == address(0)) return false;

        if (requiredLevel == AccessLevel.NONE) return true;

        if (requiredLevel == AccessLevel.EMERGENCY) {
            return accountManager.isDoctor(accessor);
        }

        if (!_isDoctorOrLab(accessor)) return false;

        AccessGrant memory grant = accessGrants[patient][accessor];

        if (!grant.isActive) return false;
        if (_isExpired(grant.expiresAt)) return false;

        return uint8(grant.level) >= uint8(requiredLevel);
    }

    /**
     * @notice Cho phép msg.sender tự kiểm tra quyền của mình với một patient.
     * @dev View function — không tốn gas viết, dùng cho check thông thường.
     */
    function checkMyAccessLevel(address patient, AccessLevel requiredLevel)
        external
        view
        returns (bool)
    {
        return checkAccessLevel(patient, msg.sender, requiredLevel);
    }

    /**
     * @notice Kiểm tra quyền của msg.sender và ghi nhật ký audit lên on-chain.
     *
     * @dev [FIX #4] Thêm rate limit: mỗi địa chỉ chỉ được gọi tối đa 1 lần
     *      mỗi ACCESS_CHECK_COOLDOWN (60) giây để chặn flood event log.
     *      Gọi quá nhanh sẽ revert RateLimitExceeded thay vì emit event.
     *
     *      CẢNH BÁO — TỐN GAS: Hàm này là non-view (emit event = write state).
     *      Chỉ dùng khi cần audit trail on-chain thực sự.
     *      Dùng checkMyAccessLevel (view) cho các check thông thường.
     *
     * @param patient       Địa chỉ bệnh nhân cần kiểm tra.
     * @param requiredLevel Mức quyền tối thiểu.
     * @return bool true nếu msg.sender có đủ quyền.
     */
    function checkMyAccessAndLog(address patient, AccessLevel requiredLevel)
        external
        returns (bool)
    {
        // [FIX #4] Rate limit: tối đa 1 lần gọi mỗi 60 giây mỗi địa chỉ
        if (block.timestamp < lastAccessCheckAt[msg.sender] + ACCESS_CHECK_COOLDOWN) {
            revert RateLimitExceeded();
        }
        lastAccessCheckAt[msg.sender] = uint64(block.timestamp);

        bool allowed = checkAccessLevel(patient, msg.sender, requiredLevel);
        emit AccessChecked(patient, msg.sender, requiredLevel, allowed, block.timestamp);
        return allowed;
    }

    /**
     * @notice Trả về toàn bộ thông tin AccessGrant giữa patient và accessor.
     *
     * @dev Trả về struct zero nếu không tồn tại grant.
     *      Không kiểm tra expiry — gọi isGrantValid nếu cần biết còn hiệu lực không.
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

    /// @dev Kiểm tra địa chỉ có phải doctor hoặc labTech không.
    function _isDoctorOrLab(address account) internal view returns (bool) {
        return accountManager.isDoctor(account) || accountManager.isLabTech(account);
    }

    /// @dev Kiểm tra một grant có hết hạn chưa.
    ///      expiresAt == 0 nghĩa là vô thời hạn — không bao giờ hết hạn.
    function _isExpired(uint64 expiresAt) internal view returns (bool) {
        return expiresAt != 0 && block.timestamp > expiresAt;
    }
}
