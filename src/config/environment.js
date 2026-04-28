// Import dotenv để load biến môi trường từ file .env vào process.env
import 'dotenv/config';

/**
 * Object env dùng để gom toàn bộ biến môi trường lại một chỗ
 * Giúp:
 * - Dễ quản lý cấu hình
 * - Tránh gọi process.env nhiều lần trong code
 * - Dễ validate và debug
 */
export const env = {
    // ==============================
    // DATABASE CONFIG
    // ==============================

    // Chuỗi kết nối MongoDB
    MONGODB_URI: process.env.MONGODB_URI,

    // Tên database sử dụng
    DATABASE_NAME: process.env.DATABASE_NAME,

    // ==============================
    // SERVER CONFIG
    // ==============================

    // Port chạy server
    APP_PORT: process.env.APP_PORT,

    // Host chạy server
    APP_HOST: process.env.APP_HOST,

    // ==============================
    // AUTH CONFIG (JWT)
    // ==============================

    // Secret key để ký access token
    ACCESS_TOKEN_SECRET_SIGNATURE: process.env.ACCESS_TOKEN_SECRET_SIGNATURE,

    // Thời gian sống của access token
    ACCESS_TOKEN_LIFE: process.env.ACCESS_TOKEN_LIFE,

    // Secret key để ký refresh token
    REFRESH_TOKEN_SECRET_SIGNATURE: process.env.REFRESH_TOKEN_SECRET_SIGNATURE,

    // Thời gian sống của refresh token
    REFRESH_TOKEN_LIFE: process.env.REFRESH_TOKEN_LIFE,

    // ==============================
    // BLOCKCHAIN CONFIG
    // ==============================

    // RPC chính để kết nối blockchain
    BLOCKCHAIN_RPC_URL: process.env.BLOCKCHAIN_RPC_URL,

    // RPC dự phòng (fallback)
    SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,

    // Địa chỉ contract IdentityManager
    IDENTITY_MANAGER_ADDRESS: process.env.IDENTITY_MANAGER_ADDRESS,

    // Địa chỉ contract DynamicAccessControl
    DYNAMIC_ACCESS_CONTROL_ADDRESS: process.env.DYNAMIC_ACCESS_CONTROL_ADDRESS,

    // Địa chỉ contract MedicalLedger
    MEDICAL_LEDGER_ADDRESS: process.env.MEDICAL_LEDGER_ADDRESS,

    // Ví admin khởi tạo ban đầu
    INITIAL_ADMIN_WALLET_ADDRESS: process.env.INITIAL_ADMIN_WALLET_ADDRESS,

    // API key dùng để verify contract hoặc gọi Etherscan API
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
};