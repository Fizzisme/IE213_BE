import swaggerJsdoc from 'swagger-jsdoc';

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
                url: 'http://localhost:8017',
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
    apis: [
        './src/routes/v1/auth.route.js',
        './src/routes/v1/admin.route.js',
        './src/routes/v1/adminAuth.route.js',
    ],
};

export const swaggerSpec = swaggerJsdoc(options);
