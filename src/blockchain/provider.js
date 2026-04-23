// src/blockchain/provider.js
import { ethers } from 'ethers';
import { env } from '~/config/environment';

if (!env.SEPOLIA_RPC_URL) {
    throw new Error('Missing required env: SEPOLIA_RPC_URL');
}

const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);

export { provider };