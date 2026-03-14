// src/validations/adminUser.validation.js
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Schema validate query params cho danh sách user
const listUsersSchema = z.object({
    status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE']).optional().default('PENDING'),
    page: z.number().int().min(1).optional().default(1),
    limit: z.number().int().min(1).max(100).optional().default(10),
    deleted: z.boolean().optional(),
});

// Schema validate body khi từ chối user
const rejectUserSchema = z.object({
    reason: z.string().min(3, 'Lý do từ chối phải có ít nhất 3 ký tự').max(1000),
});

// Validate query cho GET /admin/users
const listUsers = (req, res, next) => {
    // Query params là string, chuyển sang number trước khi validate
    if (req.query.page) req.query.page = Number(req.query.page);
    if (req.query.limit) req.query.limit = Number(req.query.limit);
    // Convert string sang boolean:
    if (req.query.deleted) req.query.deleted = req.query.deleted === 'true';
    const result = listUsersSchema.safeParse(req.query);
    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        const errorObj = new Error('Validation error');
        errorObj.statusCode = 422;
        errorObj.errors = errors;
        return next(errorObj);
    }
    // Gán validated query params
    req.query = result.data;
    next();
};

// Validate body cho PATCH /admin/users/:id/reject
const rejectUser = zodValidate(rejectUserSchema);

export const adminUserValidation = {
    listUsers,
    rejectUser,
};