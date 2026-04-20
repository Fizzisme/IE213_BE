import JWT from 'jsonwebtoken';

const generateToken = async (userInfo, secretSignature, tokenLife) => {
    try {
        const options = {
            algorithm: 'HS256',
        };

        // ✅ FOR TESTING: Remove expiresIn if tokenLife is 'never' or '0'
        if (tokenLife && tokenLife !== 'never' && tokenLife !== '0') {
            options.expiresIn = tokenLife;
        }
        // Otherwise: token will NEVER expire

        return JWT.sign(userInfo, secretSignature, options);
    } catch (error) {
        throw error;
    }
};

const verifyToken = async (token, secretSignature) => {
    try {
        return JWT.verify(token, secretSignature);
    } catch (error) {
        throw error;
    }
};

export const JwtProvider = {
    generateToken,
    verifyToken,
};
