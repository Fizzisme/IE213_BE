// src/utils/zodValidate.js
export const zodValidate = (schema) => (req, res, next) => {
    // Kết quả validate
    const result = schema.safeParse(req.body);
    // Nếu không thành công đưa về middleware xử lý lỗi tập trung
    if (!result.success) {
        // trả về 1 mảng mới errors
        const errors = result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        // Tạo 1 errorObj rồi trả về
        const errorObj = new Error('Validation error');
        errorObj.statusCode = 422;
        errorObj.errors = errors;

        return next(errorObj);
    }

    // Thành công thì cho đi qua controller

    req.body = result.data;

    next();
};
