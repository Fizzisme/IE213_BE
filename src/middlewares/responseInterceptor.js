export const responseInterceptor = (req, res, next) => {
    // Khởi tạo thời gian bắt đầu API xử lý và trả về
    const start = Date.now();
    const originalJson = res.json;

    res.json = function(data) {
        // Khoảng thời gian API trả về
        const duration = Date.now() - start;
        // Nếu là lỗi thì chỉ cần trả về lỗi
        if (res.statusCode >= 400) {
            return originalJson.call(this, {
                ...data,
                timestamp: new Date().toISOString(),
                path: req.originalUrl,
                responseTime: `${duration} ms`,
            });
        }
        // Nếu response controller là string
        const isString = typeof data === 'string';

        // Format lại response trả về
        const response = {
            statusCode: res.statusCode,
            message: isString ? data : res.statusMessage || 'Success',
            data: isString ? undefined : data ?? null,
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
            responseTime: `${duration} ms`,
        };

        return originalJson.call(this, response);
    };

    next();
};
