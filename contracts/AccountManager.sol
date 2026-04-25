// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 * -----------------------------------------------------------------------------
 * AccountManager (V4 — Gasless Patient Onboarding)
 * -----------------------------------------------------------------------------
 * Thay đổi chính:
 * - Thêm addPatient(): Admin add bệnh nhân trực tiếp → ACTIVE
 * - Cho phép backend quản lý PENDING/REJECTED off-chain (MongoDB)
 * - Blockchain chỉ lưu trạng thái ACTIVE / INACTIVE
 * -----------------------------------------------------------------------------
 */

contract AccountManager {

    // =========================================================================
    // Enums
    // =========================================================================

    enum Role {
        NONE,
        PATIENT,
        DOCTOR,
        LAB_TECH,
        ADMIN
    }

    enum AccountStatus {
        NONE,
        ACTIVE,
        INACTIVE
    }

    // =========================================================================
    // Errors
    // =========================================================================

    error NotAdmin();
    error InvalidAddress();
    error AccountAlreadyExists();
    error AccountNotFound();
    error AccountNotActive();
    error CannotModifyAdmin();
    error NewAdminMustBeDifferent();

    // =========================================================================
    // Struct
    // =========================================================================

    struct Account {
        Role role;
        AccountStatus status;
        uint64 createdAt;
        uint64 updatedAt;
    }

    // =========================================================================
    // State
    // =========================================================================

    address public admin;
    mapping(address => Account) private accounts;

    // =========================================================================
    // Events
    // =========================================================================

    event AccountRegistered(address indexed account, Role role, uint256 timestamp);
    event RoleChanged(address indexed account, Role oldRole, Role newRole, uint256 timestamp);
    event StatusChanged(address indexed account, AccountStatus oldStatus, AccountStatus newStatus, uint256 timestamp);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin, uint256 timestamp);

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier validAddress(address account) {
        if (account == address(0)) revert InvalidAddress();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() {
        admin = msg.sender;

        accounts[msg.sender] = Account({
            role: Role.ADMIN,
            status: AccountStatus.ACTIVE,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        emit AccountRegistered(msg.sender, Role.ADMIN, block.timestamp);
    }

    // =========================================================================
    // Admin — Add Users (CORE FLOW)
    // =========================================================================

    function addPatient(address patient) external onlyAdmin validAddress(patient) {
        _assignRoleAndStatus(patient, Role.PATIENT);
    }

    function addDoctor(address doctor) external onlyAdmin validAddress(doctor) {
        _assignRoleAndStatus(doctor, Role.DOCTOR);
    }

    function addLabTech(address labTech) external onlyAdmin validAddress(labTech) {
        _assignRoleAndStatus(labTech, Role.LAB_TECH);
    }

    // =========================================================================
    // Admin — Lifecycle
    // =========================================================================

    function deactivateAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];

        if (a.role == Role.NONE) revert AccountNotFound();
        if (a.status != AccountStatus.ACTIVE) revert AccountNotActive();
        if (a.role == Role.ADMIN) revert CannotModifyAdmin();

        _setStatus(account, AccountStatus.INACTIVE);
    }

    function reactivateAccount(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];

        if (a.role == Role.NONE) revert AccountNotFound();

        _setStatus(account, AccountStatus.ACTIVE);
    }

    function removeRole(address account) external onlyAdmin validAddress(account) {
        Account storage a = accounts[account];

        if (a.role == Role.NONE) revert AccountNotFound();
        if (a.role == Role.ADMIN) revert CannotModifyAdmin();

        Role oldRole = a.role;
        AccountStatus oldStatus = a.status;

        a.role = Role.NONE;
        a.status = AccountStatus.NONE;
        a.updatedAt = uint64(block.timestamp);

        emit RoleChanged(account, oldRole, Role.NONE, block.timestamp);
        emit StatusChanged(account, oldStatus, AccountStatus.NONE, block.timestamp);
    }

    // =========================================================================
    // Admin Transfer
    // =========================================================================

    function transferAdmin(address newAdmin) external onlyAdmin validAddress(newAdmin) {
        if (newAdmin == msg.sender) revert NewAdminMustBeDifferent();

        address oldAdmin = admin;

        _assignRoleAndStatus(newAdmin, Role.ADMIN);

        Account storage old = accounts[oldAdmin];
        old.role = Role.NONE;
        old.status = AccountStatus.NONE;
        old.updatedAt = uint64(block.timestamp);

        emit RoleChanged(oldAdmin, Role.ADMIN, Role.NONE, block.timestamp);
        emit StatusChanged(oldAdmin, AccountStatus.ACTIVE, AccountStatus.NONE, block.timestamp);

        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin, block.timestamp);
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getAccount(address account)
        external view
        returns (Role role, AccountStatus status, uint64 createdAt, uint64 updatedAt)
    {
        Account storage a = accounts[account];
        return (a.role, a.status, a.createdAt, a.updatedAt);
    }

    function isDoctor(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.DOCTOR && a.status == AccountStatus.ACTIVE;
    }

    function isPatient(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.PATIENT && a.status == AccountStatus.ACTIVE;
    }

    function isLabTech(address account) external view returns (bool) {
        Account storage a = accounts[account];
        return a.role == Role.LAB_TECH && a.status == AccountStatus.ACTIVE;
    }

    function isAdmin(address account) external view returns (bool) {
        return account == admin;
    }

    // =========================================================================
    // Internal
    // =========================================================================

    function _assignRoleAndStatus(address account, Role newRole) internal {
        Account storage a = accounts[account];

        if (a.role != Role.NONE) revert AccountAlreadyExists();

        a.role = newRole;
        a.status = AccountStatus.ACTIVE;
        a.createdAt = uint64(block.timestamp);
        a.updatedAt = uint64(block.timestamp);

        emit AccountRegistered(account, newRole, block.timestamp);
    }

    function _setStatus(address account, AccountStatus newStatus) internal {
        Account storage a = accounts[account];

        AccountStatus oldStatus = a.status;
        a.status = newStatus;
        a.updatedAt = uint64(block.timestamp);

        emit StatusChanged(account, oldStatus, newStatus, block.timestamp);
    }
}