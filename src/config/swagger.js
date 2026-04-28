import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '~/config/environment';

// Lấy port từ biến môi trường, nếu không có thì dùng mặc định 8017
const PORT = env.APP_PORT || 8017;

/**
 * Cấu hình Swagger (OpenAPI)
 * Dùng để tự động generate tài liệu API từ comment trong code
 */
const options = {
    definition: {
        // Phiên bản OpenAPI sử dụng
        openapi: '3.0.0',

        // Thông tin chung của API
        info: {
            title: 'EHR API', // Tên API
            version: '1.0.0', // Version
            description: 'API documentation for EHR system', // Mô tả
        },

        // Danh sách server mà API chạy
        servers: [
            {
                // Server local (dev)
                url: `http://localhost:${PORT}`,
                description: 'Local development server',
            },
            {
                // Server production (VPS)
                url: `http://62.72.46.7:${PORT}`,
                description: 'VPS Production server',
            },
        ],

        // Khai báo các thành phần dùng chung (components)
        components: {
            // Cấu hình security (xác thực)
            securitySchemes: {
                bearerAuth: {
                    type: 'http',        // Kiểu xác thực HTTP
                    scheme: 'bearer',    // Sử dụng Bearer token
                    bearerFormat: 'JWT', // Định dạng token là JWT
                },
            },
        },
    },

    // Đường dẫn tới các file chứa comment Swagger (JSDoc)
    // Swagger sẽ đọc các file này để generate API docs
    apis: ['./src/swagger/**/*.js'],
};

// Tạo swagger specification từ config
export const swaggerSpec = swaggerJsdoc(options);