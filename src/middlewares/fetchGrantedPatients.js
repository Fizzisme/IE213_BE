import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
import { blockchainContracts } from '~/blockchain/contract';
import { userModel } from '~/models/user.model';
import { patientModel } from '~/models/patient.model';

/**
 * Middleware để lấy danh sách tất cả patients mà doctor có access
 * Dùng cho các endpoint getAll() để filter dữ liệu
 *
 * Sử dụng blockchain events để tìm all patients có grant cho doctor
 */

const fetchGrantedPatients = async (req, res, next) => {
    try {
        const currentUser = req.user; // từ verifyToken middleware

        if (!currentUser || !currentUser.walletAddress) {
            throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
        }

        // Lấy tất cả BlockchainAccessGrant events từ blockchain
        // Tìm những events mà doctor (accessorAddress) = currentUser
        try {
            // Query events để tìm tất cả AccessGranted mà doctor này là accessor
            const allAccessGrantedEvents = await blockchainContracts.read.accessControl.queryFilter(
                blockchainContracts.read.accessControl.filters.AccessGranted()
            );

            // Filter: chỉ lấy events mà accessor = currentUser
            const doctorGrants = allAccessGrantedEvents.filter(event => {
                const eventAccessor = event.args.accessor.toLowerCase();
                const currentAccessor = currentUser.walletAddress.toLowerCase();
                return eventAccessor === currentAccessor;
            });

            // Kiểm tra RevokeAccess events để loại bỏ những access bị revoke
            const revokedEvents = await blockchainContracts.read.accessControl.queryFilter(
                blockchainContracts.read.accessControl.filters.AccessRevoked()
            );

            const revokedPatients = new Set();
            revokedEvents.forEach(event => {
                const patient = event.args.patient.toLowerCase();
                const accessor = event.args.accessor.toLowerCase();
                const currentAccessor = currentUser.walletAddress.toLowerCase();

                // Nếu revoke event là cho doctor này, thêm vào revoked set
                if (accessor === currentAccessor) {
                    revokedPatients.add(patient.toLowerCase());
                }
            });

            // Build danh sách patients mà doctor có active grant
            const patientAddresses = new Set();
            doctorGrants.forEach(event => {
                const patientAddress = event.args.patient.toLowerCase();

                // Chỉ thêm nếu chưa bị revoke
                if (!revokedPatients.has(patientAddress)) {
                    patientAddresses.add(patientAddress);
                }
            });

            // Chuyển wallet addresses sang MongoDB ObjectIds
            const patientIds = [];
            for (const walletAddress of patientAddresses) {
                const user = await userModel.findOne({ walletAddress });
                if (user) {
                    const patient = await patientModel.findOne({ userId: user._id });
                    if (patient) {
                        patientIds.push(patient._id.toString());
                    }
                }
            }

            // Lưu danh sách granted patients vào request
            req.grantedPatients = patientIds;
        } catch (blockchainError) {
            console.warn('⚠️ Blockchain query error:', blockchainError.message);
            // Nếu blockchain lỗi, continue với empty list (doctor không xem được gì)
            req.grantedPatients = [];
        }

        next();
    } catch (err) {
        next(err);
    }
};

export default fetchGrantedPatients;
