// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 * -----------------------------------------------------------------------------
 * AccountManager (V3 — Fixed)
 * -----------------------------------------------------------------------------
 * Vai trò chính:
 * - Quản lý danh tính on-chain và trạng thái vòng đời tài khoản.
 * - Là "source of truth" về role/status để AccessControl và EHRManager tra cứu.
 *
 * Mô hình role:
 * - NONE     : Chưa đăng ký hoặc đã bị xóa role.
 * - PATIENT  : Bệnh nhân — tự đăng ký, chờ admin duyệt.
 * - DOCTOR   : Bác sĩ — admin thêm trực tiếp, active ngay.
 * - LAB_TECH : Kỹ thuật viên xét nghiệm — admin thêm trực tiếp, active ngay.
 * - ADMIN    : Quản trị viên hệ thống — duy nhất 1 người.
 *
 * Vòng đời trạng thái tài khoản:
 * - NONE     → PENDING   : Bệnh nhân tự đăng ký.
 * - PENDING  → ACTIVE    : Admin duyệt.
 * - PENDING  → REJECTED  : Admin từ chối.
 * - REJECTED → PENDING   : Admin đưa về tái xét (requeueAccount).
 * - ACTIVE   → INACTIVE  : Admin vô hiệu hóa.
 * - INACTIVE → ACTIVE    : Admin kích hoạt lại.
 *
 * Nguyên tắc thiết kế:
 * - Chỉ 1 admin duy nhất tại mọi thời điểm — tránh xung đột quyền hạn.
 * - onlyAdmin kiểm tra msg.sender == admin trực tiếp, đơn giản và rõ ràng.
 * - Không hỗ trợ multi-admin — mở rộng multi-admin là hướng phát triển tương lai.
 * - REJECTED không reactivate trực tiếp — phải đưa về PENDING để tái xét duyệt.
 *
 * Changelog (Fixed):
 * - [FIX #6] requeueAccount: đổi revert AccountNotPending → AccountNotRejected
 *   để error name đúng với ngữ nghĩa thực tế.
 * -----------------------------------------------------------------------------
 */

contract AccountManager {

    // =========================================================================
    // Enums
    // =========================================================================

    /// @notice Các vai trò trong hệ thống.
    enum Role {
        NONE,      // Chưa có role hoặc đã bị thu hồi
        PATIENT,   // Bệnh nhân
        DOCTOR,    // Bác sĩ
        LAB_TECH,  // Kỹ thuật viên xét nghiệm
        ADMIN      // Quản trị viên
    }

    /// @notice Trạng thái vòng đời của tài khoản.
    enum AccountStatus {
        NONE,      // Chưa tồn tại hoặc đã bị xóa
        PENDING,   // Chờ admin duyệt
        ACTIVE,    // Đang hoạt động
        REJECTED,  // Bị từ chối
        INACTIVE   // Bị vô hiệu hóa tạm thời
    }

    // =========================================================================
    // Custom Errors
    // =========================================================================

    error NotAdmin();                  // Người gọi không phải admin
    error InvalidAddress();            // Địa chỉ không hợp lệ (zero address)
    error AccountAlreadyExists();      // Ví đã đăng ký rồi, không đăng ký lại
    error AccountNotFound();           // Tài khoản chưa tồn tại trong hệ thống
    error AccountNotPending();         // Tài khoản không ở trạng thái PENDING
    error AccountNotActive();          // Tài khoản không ở trạng thái ACTIVE
    error AccountNotRejected();        // [FIX #6] Tài khoản không ở trạng thái REJECTED
    error AccountNotReactivatable();   // Tài khoản không thể kích hoạt lại
    error CannotModifyAdmin();         // Không được sửa/xóa tài khoản admin
    error NewAdminMustBeDifferent();   // Admin mới phải khác admin hiện tại

    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice Thông tin tài khoản lưu on-chain.
    struct Account {
        Role role;             // Vai trò hiện tại
        AccountStatus status;  // Trạng thái hiện tại
        uint64 createdAt;      // Timestamp tạo tài khoản (unix seconds)
        uint64 updatedAt;      // Timestamp cập nhật gần nhất
    }

    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice Địa chỉ admin duy nhất của hệ thống.
    address public admin;

    /// @notice Lưu trữ thông tin tài khoản theo địa chỉ ví.
    mapping(address => Account) private accounts;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Phát ra khi một tài khoản mới được đăng ký hoặc admin thêm nhân sự.
    event AccountRegistered(
        address indexed account,
        Role role,
        AccountStatus status,
        uint256 timestamp
    );

    /// @notice Phát ra khi role của tài khoản thay đổi.
    event RoleChanged(
        address indexed account,
        Role oldRole,
        Role newRole,
        uint256 timestamp
    );

    /// @notice Phát ra khi trạng thái tài khoản thay đổi.
    event StatusChanged(
        address indexed account,
        AccountStatus oldStatus,
        AccountStatus newStatus,
        uint256 timestamp
    );

    /// @notice Phát ra khi quyền admin được chuyển giao sang người mới.
    event AdminTransferred(
        address indexed oldAdmin,
        address indexed newAdmin,
        uint256 timestamp
    );

    // =========================================================================
    // Modifiers
    // =========================================================================

    /// @dev Kiểm tra địa chỉ khác zero address trước khi thực thi.
    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    /// @dev Chỉ admin hiện tại mới được gọi hàm được bảo vệ bởi modifier này.
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Khởi tạo contract, đặt người deploy làm admin đầu tiên.
    constructor() {
        admin = msg.sender;
        accounts[msg.sender] = Account({
            role:      Role.ADMIN,
            status:    AccountStatus.ACTIVE,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        emit AccountRegistered(msg.sender, Role.ADMIN, AccountStatus.ACTIVE, block.timestamp);
    }

    // =========================================================================
    // Public — Bệnh nhân tự đăng ký
    // =========================================================================

    /// @notice Bệnh nhân tự đăng ký tài khoản, chờ admin duyệt.
    function registerPatient() external {
        if (accounts[msg.sender].role != Role.NONE) revert AccountAlreadyExists();

        accounts[msg.sender] = Account({
            role:      Role.PATIENT,
            status:    AccountStatus.PENDING,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        emit AccountRegistered(msg.sender, Role.PATIENT, AccountStatus.PENDING, block.timestamp);
    }

    // =========================================================================
    // Admin — Thêm nhân sự
    // =========================================================================

    /// @notice Admin thêm bác sĩ vào hệ thống, kích hoạt ngay lập tức.
    function addDoctor(address doctor) external onlyAdmin validAddress(doctor) {
        _assignRoleAndStatus(doctor, Role.DOCTOR, AccountStatus.ACTIVE);
    }

    /// @notice Admin thêm kỹ thuật viên xét nghiệm, kích hoạt ngay lập tức.
    function addLabTech(address labTech) external onlyAdmin validAddress(labTech) {
        _assignRoleAndStatus(labTech, Role.LAB_TECH, AccountStatus.ACTIVE);
    }

    // =========================================================================
    // Admin — Quản lý vòng đời tài khoản
    // =========================================================================

    /// @notice Admin duyệt tài khoản bệnh nhân đang PENDING → ACTIVE.
    function approveAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)               revert AccountNotFound();
        if (a.status != AccountStatus.PENDING)  revert AccountNotPending();

        _setStatus(account, AccountStatus.ACTIVE);
    }

    /// @notice Admin từ chối tài khoản bệnh nhân đang PENDING → REJECTED.
    function rejectAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)               revert AccountNotFound();
        if (a.status != AccountStatus.PENDING)  revert AccountNotPending();

        _setStatus(account, AccountStatus.REJECTED);
    }

    /// @notice Admin đưa tài khoản REJECTED về PENDING để tái xét duyệt.
    /// @dev [FIX #6] Sửa revert AccountNotPending → AccountNotRejected cho đúng ngữ nghĩa.
    ///      Tài khoản cần phải đang ở REJECTED mới được requeue — không phải PENDING.
    function requeueAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)                revert AccountNotFound();
        if (a.status != AccountStatus.REJECTED)  revert AccountNotRejected(); // [FIX #6]

        _setStatus(account, AccountStatus.PENDING);
    }

    /// @notice Admin vô hiệu hóa tài khoản đang ACTIVE → INACTIVE.
    function deactivateAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)              revert AccountNotFound();
        if (a.status != AccountStatus.ACTIVE)  revert AccountNotActive();
        if (a.role == Role.ADMIN)              revert CannotModifyAdmin();

        _setStatus(account, AccountStatus.INACTIVE);
    }

    /// @notice Admin kích hoạt lại tài khoản đang INACTIVE → ACTIVE.
    function reactivateAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)                revert AccountNotFound();
        if (a.status != AccountStatus.INACTIVE)  revert AccountNotReactivatable();

        _setStatus(account, AccountStatus.ACTIVE);
    }

    /// @notice Admin xóa role của nhân sự (doctor, lab tech).
    function removeRole(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];
        if (a.role == Role.NONE)   revert AccountNotFound();
        if (a.role == Role.ADMIN)  revert CannotModifyAdmin();

        Role oldRole            = a.role;
        AccountStatus oldStatus = a.status;

        a.role      = Role.NONE;
        a.status    = AccountStatus.NONE;
        a.updatedAt = uint64(block.timestamp);

        emit RoleChanged(account, oldRole, Role.NONE, block.timestamp);
        emit StatusChanged(account, oldStatus, AccountStatus.NONE, block.timestamp);
    }

    // =========================================================================
    // Admin — Chuyển giao quyền admin
    // =========================================================================

    /// @notice Chuyển toàn bộ quyền admin sang địa chỉ mới.
    function transferAdmin(address newAdmin) external onlyAdmin validAddress(newAdmin) {
        if (newAdmin == msg.sender) revert NewAdminMustBeDifferent();

        address oldAdmin = admin;

        _assignRoleAndStatus(newAdmin, Role.ADMIN, AccountStatus.ACTIVE);

        Account storage old = accounts[oldAdmin];
        old.role      = Role.NONE;
        old.status    = AccountStatus.NONE;
        old.updatedAt = uint64(block.timestamp);

        emit RoleChanged(oldAdmin, Role.ADMIN, Role.NONE, block.timestamp);
        emit StatusChanged(oldAdmin, AccountStatus.ACTIVE, AccountStatus.NONE, block.timestamp);

        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin, block.timestamp);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Lấy toàn bộ thông tin tài khoản của một địa chỉ.
    function getAccount(address account)
        external view
        returns (Role role, AccountStatus status, uint64 createdAt, uint64 updatedAt)
    {
        Account storage a = accounts[account];
        return (a.role, a.status, a.createdAt, a.updatedAt);
    }

    /// @notice Lấy role hiện tại của một địa chỉ.
    function getRole(address account) external view returns (Role) {
        return accounts[account].role;
    }

    /// @notice Lấy trạng thái hiện tại của một địa chỉ.
    function getStatus(address account) external view returns (AccountStatus) {
        return accounts[account].status;
    }

    /// @notice Kiểm tra địa chỉ có phải bác sĩ đang active không.
    function isDoctor(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.DOCTOR && a.status == AccountStatus.ACTIVE;
    }

    /// @notice Kiểm tra địa chỉ có phải lab tech đang active không.
    function isLabTech(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.LAB_TECH && a.status == AccountStatus.ACTIVE;
    }

    /// @notice Kiểm tra địa chỉ có phải bệnh nhân đang active không.
    function isPatient(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.PATIENT && a.status == AccountStatus.ACTIVE;
    }

    /// @notice Kiểm tra địa chỉ có phải admin không.
    function isAdmin(address account) external view returns (bool) {
        return account == admin;
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// @dev Gán role và status cho một tài khoản.
    function _assignRoleAndStatus(
        address account,
        Role newRole,
        AccountStatus newStatus
    ) internal {
        Account storage a = accounts[account];
        Role oldRole            = a.role;
        AccountStatus oldStatus = a.status;

        if (oldRole == Role.NONE) {
            a.createdAt = uint64(block.timestamp);
            emit AccountRegistered(account, newRole, newStatus, block.timestamp);
        } else {
            emit RoleChanged(account, oldRole, newRole, block.timestamp);
            emit StatusChanged(account, oldStatus, newStatus, block.timestamp);
        }

        a.role      = newRole;
        a.status    = newStatus;
        a.updatedAt = uint64(block.timestamp);
    }

    /// @dev Cập nhật trạng thái tài khoản và emit StatusChanged.
    function _setStatus(address account, AccountStatus newStatus) internal {
        Account storage a = accounts[account];
        AccountStatus oldStatus = a.status;

        a.status    = newStatus;
        a.updatedAt = uint64(block.timestamp);

        emit StatusChanged(account, oldStatus, newStatus, block.timestamp);
    }
}
