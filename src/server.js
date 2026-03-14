import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from '~/config/environment';
import { connectDB } from '~/config/mongodb';
import { errorHandlingMiddleware } from '~/middlewares/errorHandlingMiddleware';
import { APIs_V1 } from '~/routes/v1';
import cors from 'cors';
import { WHITELIST_DOMAINS } from '~/utils/constants';
import { responseInterceptor } from '~/middlewares/responseInterceptor';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '~/config/swagger';
import cookieParser from 'cookie-parser';

// Hàm bắt đầu server
const START_SERVER = async () => {
    // Tạo ra app express
    const app = express();

    // Xử lý cors
    app.use(
        cors({
            origin: WHITELIST_DOMAINS,
            allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header', 'Upgrade-Insecure-Requests'],
            allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
            exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
            maxAge: 600,
            credentials: true,
        }),
    );

    // Xử lý req.body json data
    app.use(express.json());
    app.use(cookieParser());

    // Kết nối tới MongoDB
    await connectDB();

    // Format lại api response
    app.use(responseInterceptor);

    // Sử dụng để lấy biến được lưu trong cookie
    app.use(cookieParser());

    // Sử dụng APIs_V1
    app.use('/v1', APIs_V1);

    // Tạo 1 swagger
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // Middleware xử lý lỗi tập trung
    app.use(errorHandlingMiddleware);

    const HOST = env.APP_HOST || 'localhost';
    const PORT = env.APP_PORT || 8017;

    app.get('/', (req, res) => {
        res.end('<h1>Hello World!</h1><hr>');
    });

    app.listen(PORT, HOST, () => {
        console.log(`✅ Server is running at http://${HOST}:${PORT}/`);
    });
};

START_SERVER();
