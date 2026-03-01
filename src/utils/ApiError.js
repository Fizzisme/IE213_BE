// Custom 1 ApiError có thể thêm statusCode
class ApiError extends Error {
    constructor(statusCode, message) {
        // Gọi tới hàm khởi tạo của class Error
        super(message);

        this.name = 'ApiError';
        // Gán thêm http status code
        this.statusCode = statusCode;

        // Ghi lại Stack Trace (dấu vết ngăn xếp) để thuận tiện cho việc debug
        Error.captureStackTrace(this, this.constructor);
    }
}

export default ApiError;
