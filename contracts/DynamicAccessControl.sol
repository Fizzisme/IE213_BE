// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IdentityManager.sol";

/**
 * @title DynamicAccessControl
 * @dev Trụ cột 2: Kiểm soát Truy cập Hồ sơ y tế.
 * 
 * TRI THỨC WEB3:
 * 1. Time-bound Access: Quyền truy cập không phải là vĩnh viễn. Bác sĩ chỉ được phép xem hồ sơ 
 *    trong một khoảng thời gian nhất định (ví dụ: 24h kể từ khi bệnh nhân tới khám).
 * 2. Lazy Evaluation: Thay vì dùng hàm xóa quyền (tốn Gas), ta kiểm tra thời hạn (expiresAt) 
 *    ngay lúc truy cập. Nếu quá hạn, hệ thống tự động coi như không có quyền.
 */
contract DynamicAccessControl {
    IdentityManager public idManager;

    struct AccessToken {
        bool isGranted;    // Cờ xác nhận cấp quyền
        uint256 expiresAt; // Thời điểm hết hạn (Unix timestamp)
    }

    // Patient => Doctor => AccessToken
    mapping(address => mapping(address => AccessToken)) public accessTokens;

    error NotPatient();
    error DoctorNotActive();
    error AccessDenied();

    event AccessGranted(address indexed patient, address indexed doctor, uint256 expiresAt);
    event AccessRevoked(address indexed patient, address indexed doctor);

    constructor(address _idManager) {
        idManager = IdentityManager(_idManager);
    }

    /**
     * @notice Bệnh nhân cấp quyền cho Bác sĩ. 
     * @dev Thường gọi khi Bệnh nhân đến khám (dựa trên Appointment ID ở Backend).
     * @param doctor Địa chỉ ví của bác sĩ.
     * @param durationHours Số giờ bác sĩ được phép xem hồ sơ (ví dụ: 24).
     */
    function grantAccess(address doctor, uint256 durationHours) external {
        // Kiểm tra msg.sender phải là Bệnh nhân
        if (!idManager.hasRole(msg.sender, IdentityManager.Role.PATIENT)) revert NotPatient();
        // Kiểm tra đối tượng được cấp phải là Bác sĩ đang hoạt động
        if (!idManager.hasRole(doctor, IdentityManager.Role.DOCTOR)) revert DoctorNotActive();

        accessTokens[msg.sender][doctor] = AccessToken({
            isGranted: true,
            expiresAt: block.timestamp + (durationHours * 1 hours)
        });

        emit AccessGranted(msg.sender, doctor, block.timestamp + (durationHours * 1 hours));
    }

    /**
     * @notice Bệnh nhân chủ động thu hồi quyền trước thời hạn.
     */
    function revokeAccess(address doctor) external {
        if (!idManager.hasRole(msg.sender, IdentityManager.Role.PATIENT)) revert NotPatient();
        
        accessTokens[msg.sender][doctor].isGranted = false;
        emit AccessRevoked(msg.sender, doctor);
    }

    /**
     * @notice Hàm kiểm tra quyền truy cập thời gian thực.
     * @dev Backend gọi hàm này trước khi cho phép Bác sĩ xem dữ liệu chi tiết từ MongoDB.
     */
    function canAccess(address patient, address doctor) external view returns (bool) {
        AccessToken memory token = accessTokens[patient][doctor];
        // Quyền hợp lệ nếu: (1) Được cấp cờ isGranted AND (2) Chưa tới thời điểm hết hạn
        return token.isGranted && block.timestamp <= token.expiresAt;
    }
}
