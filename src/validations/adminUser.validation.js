// src/validations/adminUser.validation.js
import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Schema validate query params cho danh sách user
const listUsersSchema = z.object({
    status: z
        .enum(['PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE'])
        .optional()
        .default('PENDING'),
    page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10),
    deleted: z.boolean().optional(),
});

// Schema validate body khi từ chối user
const rejectUserSchema = z.object({
    reason: z
        .string()
        .min(3, 'Lý do từ chối phải có ít nhất 3 ký tự')
        .max(1000),
});

// Schema validate body khi verify CMND
const verifyIdDocumentSchema = z.object({
    isVerified: z.boolean({
        errorMap: () => ({ message: 'isVerified phải là true hoặc false' }),
    }),
    notes: z
        .string()
        .max(500, 'Ghi chú tối đa 500 ký tự')
        .optional()
        .nullable(),
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

// Validate body cho PATCH /admin/users/:id/verify-id
const verifyIdDocument = zodValidate(verifyIdDocumentSchema);

// Schema validate body khi admin tạo doctor
const createDoctorSchema = z.object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    nationId: z.string().optional(),
    walletAddress: z.string().optional(),
});

// Schema validate body khi admin tạo lab tech
const createLabTechSchema = z.object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    nationId: z.string().optional(),
    walletAddress: z.string().optional(),
});

// Validate body cho POST /admin/users/create-doctor
const createDoctor = zodValidate(createDoctorSchema);

// Validate body cho POST /admin/users/create-labtech
const createLabTech = zodValidate(createLabTechSchema);

export const adminUserValidation = {
    listUsers,
    rejectUser,
    verifyIdDocument,
    createDoctor,
    createLabTech,
};
