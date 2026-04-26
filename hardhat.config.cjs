require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: '0.8.20',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            chainId: 31337,
        },
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || process.env.BLOCKCHAIN_RPC_URL || '',
            accounts:
                process.env.ADMIN_PRIVATE_KEY
                    ? [process.env.ADMIN_PRIVATE_KEY]
                    : [],
            chainId: 11155111,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || '',
    },
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
    mocha: {
        timeout: 40000,
    },
};
