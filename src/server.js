import express from 'express';
// Thêm dependencies vào
import cookieParser from 'cookie-parser';
import { env } from '~/config/environment';
import { connectDB } from '~/config/mongodb';
import { errorHandlingMiddleware } from '~/middlewares/errorHandlingMiddleware';
import { APIs_V1 } from '~/routes/v1';
import cors from 'cors';
import { WHITELIST_DOMAINS } from '~/utils/constants';
import { responseInterceptor } from '~/middlewares/responseInterceptor';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec, setupSwagger } from '~/config/swagger';
import http from 'http';

const listenWithRetry = (app, host, startPort, maxRetries = 10) => {
    let currentPort = Number(startPort);

    const start = () => {
        const server = http.createServer(app);

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE' && currentPort < Number(startPort) + maxRetries) {
                console.warn(`Port ${currentPort} is in use, retrying on ${currentPort + 1}...`);
                currentPort += 1;
                return start();
            }
            throw error;
        });

        server.listen(currentPort, host, () => {
            console.log(`Server is running at http://${host}:${currentPort}/`);
        });
    };

    start();
};

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

    // Tạo 1 swagger
    setupSwagger(app);

    // Format lại api response
    app.use(responseInterceptor);

    app.use(cookieParser());
    // Sử dụng APIs_V1
    app.use('/v1', APIs_V1);


    // Middleware xử lý lỗi tập trung
    app.use(errorHandlingMiddleware);

    const HOST = env.APP_HOST || 'localhost';
    const PORT = env.APP_PORT || 8017;

    app.get('/', (req, res) => {
        res.end('<h1>Hello World!</h1><hr>');
    });

    listenWithRetry(app, HOST, PORT);
};

START_SERVER();
