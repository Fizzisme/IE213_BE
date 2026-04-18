/**
 * Hàm tiện ích xử lý ví
 * ======================
 * Xử lý địa chỉ ví tập trung để đảm bảo tính nhất quán trên tất cả các service
 * 
 * Xuất từ: Nguồn duy nhất cho chuẩn hóa ví
 * Được sử dụng bởi: ehrWorkflow.service.js, labOrder.service.js, admin.service.js, adminUser.service.js
 * 
 * Tại sao tập trung hóa?
 * - Tránh trùng lặp code (trước đây ở 2+ service)
 * - Đảm bảo chuẩn hóa chữ thường nhất quán
 * - Dễ dàng thêm quy tắc xác thực ví trong tương lai
 * - Điểm trung tâm cho tiện ích liên quan ví
 */

/**
 * Chuẩn hóa địa chỉ ví thành chữ thường
 * @param {string} address - Địa chỉ ví cần chuẩn hóa
 * @returns {string|null} Địa chỉ đã chuẩn hóa hoặc null nếu không hợp lệ
 */
const normalizeWalletAddress = (address) => {
    if (!address || typeof address !== 'string') return null;
    return address.toLowerCase().trim();
};

/**
 * So sánh 2 địa chỉ ví (không phân biệt chữ hoa/thường)
 * @param {string} addr1 - Địa chỉ ví thứ nhất
 * @param {string} addr2 - Địa chỉ ví thứ hai
 * @returns {boolean} true nếu địa chỉ khớp (không phân biệt chữ hoa/thường)
 */
const compareWalletAddresses = (addr1, addr2) => {
    return normalizeWalletAddress(addr1) === normalizeWalletAddress(addr2);
};

module.exports = {
    normalizeWalletAddress,
    compareWalletAddresses,
};
