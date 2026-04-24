import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '~/config/environment';

const PORT = env.APP_PORT || 8017;

// Config swagger
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'EHR API',
            version: '1.0.0',
            description: 'API documentation for EHR system',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Local server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./src/swagger/**/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
