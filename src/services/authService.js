import { userModel } from '~/models/userModel';
import { patientModel } from '~/models/patientModel';
import { auditLogModel } from '~/models/auditLogModel';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

const register = async (payload) => {
    // create user
    const user = await userModel.createNew({
        role: payload.role.toUpperCase(),
        status: 'ACTIVE',
        authProviders: [
            payload.phoneNumber && {
                type: 'PHONE',
                phoneHash: bcrypt.hashSync(payload.phoneNumber, 8),
                passwordHash: bcrypt.hashSync(payload.password, 8),
            },
        ].filter(Boolean),
        nationId: payload.nationId,
    });

    // create patient after create user successfully
    const patient = await patientModel.createNew({
        userId: user._id,
        fullName: payload.fullName,
        gender: payload.gender,
        birthYear: payload.dob,
        phoneEncrypted: bcrypt.hashSync(payload.phoneNumber, 8),
        emailEncrypted: bcrypt.hashSync(payload.email, 8),
        status: 'ACTIVE',
    });

    // create audit log
    await auditLogModel.createLog({
        userId: user._id,
        action: 'REGISTER_PATIENT',
        entityType: 'PATIENT',
        entityId: patient._id,
    });

    return {
        userId: user._id,
        patientId: patient._id,
    };
};

const NONCE_STORE = new Map();

// Create nonce wallet
const createWalletNonce = async (walletAddress) => {
    if (!walletAddress) throw new Error('Wallet address required');

    const nonce = `Login ${Date.now()} - ${uuidv4()}`;
    NONCE_STORE.set(walletAddress.toLowerCase(), nonce);
    return nonce;
};

// Verify wallet when login
const verifyWalletLogin = async (walletAddress, signature) => {
    const nonce = NONCE_STORE.get(walletAddress.toLowerCase());
    if (!nonce) throw new Error('Nonce expired');

    const recovered = ethers.verifyMessage(nonce, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Invalid signature');
    }

    NONCE_STORE.delete(walletAddress.toLowerCase());
    let user = await userModel.findByWalletAddress(walletAddress);
    // First time login with wallet
    if (!user)
        user = await userModel.createNew({
            authProviders: [
                walletAddress && {
                    type: 'WALLET',
                    walletAddress,
                },
            ].filter(Boolean),
        });

    await auditLogModel.createLog({
        userId: user._id,
        walletAddress,
        action: 'LOGIN_WALLET',
        entityType: 'USER',
        entityId: user._id,
    });

    return {
        userId: user._id,
        role: user.role,
        accessToken: 'JWT_HERE',
    };
};

export const authService = {
    register,
    createWalletNonce,
    verifyWalletLogin,
};
