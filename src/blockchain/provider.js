// src/blockchain/provider.js
import { ethers } from 'ethers';
import { env } from '~/config/environment';

if (!env.SEPOLIA_RPC_URL) {
    throw new Error('Missing required env: SEPOLIA_RPC_URL');
}

if (!env.ADMIN_PRIVATE_KEY) {
    throw new Error('Missing required env: ADMIN_PRIVATE_KEY');
}

const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);

// Wallet admin — dùng cho các hàm admin operations (add doctor, lab tech, etc)
const adminWallet = new ethers.Wallet(
    env.ADMIN_PRIVATE_KEY,
    provider
);

// Test Wallets — dùng cho testing operations (grant access, create orders, etc)
// Development/Testing only - Frontend will sign via MetaMask in production

// Test Patient Wallet — dùng cho testing patient operations (grant access, revoke, etc)
const patientWallet = env.TEST_PATIENT_PRIVATE_KEY
    ? new ethers.Wallet(env.TEST_PATIENT_PRIVATE_KEY, provider)
    : null;

if (patientWallet) {
    console.log('✅ Test Patient Wallet connected:', patientWallet.address);
}

// Test Doctor Wallet — dùng cho testing doctor operations (create lab order, etc)
let doctorWallet = null;
try {
    if (env.TEST_DOCTOR_PRIVATE_KEY) {
        doctorWallet = new ethers.Wallet(env.TEST_DOCTOR_PRIVATE_KEY, provider);
        console.log('✅ Test Doctor Wallet connected:', doctorWallet.address);
    } else {
        console.warn('⚠️  TEST_DOCTOR_PRIVATE_KEY not configured');
    }
} catch (error) {
    console.error('❌ FAILED to initialize Doctor Wallet:', error.message);
    console.error('   TEST_DOCTOR_PRIVATE_KEY value:', env.TEST_DOCTOR_PRIVATE_KEY);
    console.error('   Make sure private key format is correct (64 hex chars without 0x prefix)');
    doctorWallet = null;
}

// Test Lab Tech Wallet — dùng cho testing lab tech operations (post result, receive order, etc)
const labTechWallet = env.TEST_LAB_PRIVATE_KEY
    ? new ethers.Wallet(env.TEST_LAB_PRIVATE_KEY, provider)
    : null;

if (labTechWallet) {
    console.log('✅ Test Lab Tech Wallet connected:', labTechWallet.address);
}

export { provider, adminWallet, patientWallet, doctorWallet, labTechWallet };