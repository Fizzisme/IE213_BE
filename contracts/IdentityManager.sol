// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title IdentityManager
 * @dev Trụ cột 1: Quản lý Định danh (Identity) và Vai trò (Role).
 * 
 * TRI THỨC WEB3:
 * 1. RBAC (Role-Based Access Control): Sử dụng Enum giúp tiết kiệm Gas hơn so với dùng String.
 * 2. Gasless Onboarding (EIP-712 Concept): Cho phép Bệnh nhân tham gia hệ thống mà không cần 
 *    sở hữu ETH để trả phí Gas. Bệnh nhân ký "bằng chứng ý chí" Off-chain, Admin/Backend nộp bằng chứng đó On-chain.
 */
contract IdentityManager {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Phân quyền theo vai trò - Enum giúp tối ưu hóa lưu trữ On-chain
    enum Role { NONE, PATIENT, DOCTOR, LAB_TECH, ADMIN }

    struct Account {
        Role role;           // Vai trò người dùng
        bool isActive;       // Trạng thái hoạt động
        uint256 registeredAt; // Thời điểm đăng ký
    }

    mapping(address => Account) public accounts;
    address public admin;

    // Lỗi tùy chỉnh giúp tiết kiệm Gas và cung cấp thông tin lỗi rõ ràng
    error NotAdmin();
    error AccountExists();
    error InvalidSignature();

    event RoleAssigned(address indexed user, Role role, uint256 timestamp);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
        accounts[admin] = Account(Role.ADMIN, true, block.timestamp);
    }

    /**
     * @notice Admin đăng ký tài khoản cho Bác sĩ hoặc Kỹ thuật viên.
     * @param staff Địa chỉ ví của nhân viên y tế.
     * @param role Vai trò (DOCTOR hoặc LAB_TECH).
     */
    function registerStaff(address staff, Role role) external onlyAdmin {
        if (accounts[staff].role != Role.NONE) revert AccountExists();
        if (role != Role.DOCTOR && role != Role.LAB_TECH) revert("Invalid staff role");

        accounts[staff] = Account(role, true, block.timestamp);
        emit RoleAssigned(staff, role, block.timestamp);
    }

    /**
     * @notice TÍNH NĂNG ĂN ĐIỂM: Đăng ký Bệnh nhân không tốn Gas (Gasless).
     * @dev Bệnh nhân ký thông điệp "REGISTER_ZUNI_PATIENT" ở Frontend.
     * Admin dùng địa chỉ ví quản trị để nộp chữ ký đó lên mạng lưới.
     */
    function registerPatientGasless(address patient, bytes calldata signature) external onlyAdmin {
        if (accounts[patient].role != Role.NONE) revert AccountExists();

        // Tái tạo lời nhắn bệnh nhân đã ký
        bytes32 messageHash = keccak256(abi.encodePacked("REGISTER_ZUNI_PATIENT")).toEthSignedMessageHash();
        
        // Phục hồi địa chỉ ví từ chữ ký số
        address signer = messageHash.recover(signature);
        
        // Xác minh ví phục hồi có khớp với ví bệnh nhân không
        if (signer != patient) revert InvalidSignature();

        accounts[patient] = Account(Role.PATIENT, true, block.timestamp);
        emit RoleAssigned(patient, Role.PATIENT, block.timestamp);
    }

    /**
     * @notice Hàm kiểm tra quyền hạn (Dùng cho các Smart Contract khác gọi sang).
     */
    function hasRole(address user, Role role) external view returns (bool) {
        return accounts[user].role == role && accounts[user].isActive;
    }

    /**
     * @notice Chuyển nhượng quyền Admin (nếu cần).
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }
}
