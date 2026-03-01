import { StatusCodes } from 'http-status-codes';

export const errorHandlingMiddleware = (err, req, res, next) => {
    // Mặc định statusCode = 500
    if (!err.statusCode) err.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;

    // Nếu lỗi có mảng errors thì trả về (thường là lỗi validate)
    if (err.errors) {
        return res.status(err.statusCode).json({
            statusCode: err.statusCode,
            message: err.message || 'Validation Error',
            errors: err.errors,
        });
    }

    // Tạo ra biến format lỗi muốn trả về
    const responseError = {
        statusCode: err.statusCode,
        message: err.message || StatusCodes[err.statusCode],
    };

    // if (env.BUILD_MODE !== 'dev') delete responseError.stack;

    // Trả responseError
    res.status(responseError.statusCode).json(responseError);
};
