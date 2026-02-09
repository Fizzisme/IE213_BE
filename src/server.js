import express from 'express';
import { env } from '~/config/environment';
import exitHook from 'async-exit-hook';
import { connectDB } from '~/config/mongodb';
import { errorHandlingMiddleware } from '~/middlewares/errorHandlingMiddleware';
import { APIs_V1 } from '~/routes/v1';
import { corsOptions } from '~/config/cors';
import cors from 'cors';

const START_SERVER = async () => {
    const app = express();

    //xu ly cors
    app.use(
        cors({
            origin: 'http://localhost:5173',
            allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header', 'Upgrade-Insecure-Requests'],
            allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
            exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
            maxAge: 600,
            credentials: true,
        }),
    );

    //Enable req.body json data
    app.use(express.json());

    // Connect to MongoDB
    await connectDB();

    // use APIs_V1
    app.use('/v1', APIs_V1);

    // middleware xu ly loi tap trung
    // app.use(errorHandlingMiddleware);

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
