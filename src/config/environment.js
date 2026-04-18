import 'dotenv/config';

export const env = {
    MONGODB_URI: process.env.MONGODB_URI,
    DATABASE_NAME: process.env.DATABASE_NAME,
    APP_PORT: process.env.APP_PORT,
    APP_HOST: process.env.APP_HOST,

    ACCESS_TOKEN_SECRET_SIGNATURE: process.env.ACCESS_TOKEN_SECRET_SIGNATURE,
    ACCESS_TOKEN_LIFE: process.env.ACCESS_TOKEN_LIFE,
    REFRESH_TOKEN_SECRET_SIGNATURE: process.env.REFRESH_TOKEN_SECRET_SIGNATURE,
    REFRESH_TOKEN_LIFE: process.env.REFRESH_TOKEN_LIFE,

    SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
    ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY,
    ACCOUNT_MANAGER_ADDRESS: process.env.ACCOUNT_MANAGER_ADDRESS,
    ACCESS_CONTROL_ADDRESS: process.env.ACCESS_CONTROL_ADDRESS,
    EHR_MANAGER_ADDRESS: process.env.EHR_MANAGER_ADDRESS,
    CHAIN_ID: Number(process.env.CHAIN_ID || 11155111),

    // Test Wallets (development/testing only)
    TEST_PATIENT_PRIVATE_KEY: process.env.TEST_PATIENT_PRIVATE_KEY,
    TEST_DOCTOR_PRIVATE_KEY: process.env.TEST_DOCTOR_PRIVATE_KEY,
    TEST_LAB_PRIVATE_KEY: process.env.TEST_LAB_PRIVATE_KEY,
};

// ✅ DEBUG: Log private key loading status
if (process.env.TEST_DOCTOR_PRIVATE_KEY) {
    console.log('[ENV] TEST_DOCTOR_PRIVATE_KEY loaded, length:', process.env.TEST_DOCTOR_PRIVATE_KEY.length);
} else {
    console.warn('[ENV] ⚠️  TEST_DOCTOR_PRIVATE_KEY not found in process.env');
}
