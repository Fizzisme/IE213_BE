import mongoose from 'mongoose';
import { env } from '~/config/environment.js';

const MONGODB_URI = env.MONGODB_URI;
// Nếu không có MONGODB_URI thì ném ra lỗi
if (!MONGODB_URI) {
    throw new Error('MONGO_URI is not defined');
}

// Hàm kết nối tới DB
export const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: env.DATABASE_NAME,
        });

        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection failed', error);
        process.exit(1);
    }
};
