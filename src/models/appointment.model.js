import mongoose from 'mongoose';

// Tên collection trong MongoDB
const COLLECTION_NAME = 'appointments';

/**
 * Enum trạng thái của lịch hẹn
 */
const APPOINTMENT_STATUS = {
    PENDING: 'PENDING',         // Chờ xác nhận
    CONFIRMED: 'CONFIRMED',     // Đã xác nhận
    COMPLETED: 'COMPLETED',     // Đã hoàn thành
    CANCELLED: 'CANCELLED',     // Đã hủy
};

/**
 * Schema định nghĩa cấu trúc dữ liệu cho Appointment
 */
const appointmentSchema = new mongoose.Schema(
    {
        // ID bệnh nhân
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'patients',
            required: true,
        },

        // ID bác sĩ
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'doctors',
            required: true,
        },

        // ID dịch vụ khám
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'services',
            required: true,
        },

        // Thời gian lịch hẹn
        appointmentDateTime: {
            type: Date,
            required: true,
        },

        // Mô tả triệu chứng từ bệnh nhân
        patientDescription: String,

        // Giá dịch vụ
        price: Number,

        // Trạng thái lịch hẹn
        status: {
            type: String,
            enum: Object.values(APPOINTMENT_STATUS), // chỉ cho phép các giá trị enum
            default: APPOINTMENT_STATUS.PENDING,
        },

        // Trường phục vụ xóa mềm
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // tự động thêm createdAt, updatedAt
    },
);

/**
 * Tạo index để tối ưu truy vấn
 */
appointmentSchema.index({ patientId: 1 });             // tìm theo bệnh nhân
appointmentSchema.index({ doctorId: 1 });              // tìm theo bác sĩ
appointmentSchema.index({ appointmentDateTime: 1 });   // tìm theo thời gian

/**
 * Khởi tạo model
 */
const AppointmentModel = mongoose.model(COLLECTION_NAME, appointmentSchema);

/**
 * Tạo lịch hẹn mới
 * - Mặc định status = PENDING
 */
const createNew = async (data) => {
    return await AppointmentModel.create({
        ...data,
        status: APPOINTMENT_STATUS.PENDING,
    });
};

/**
 * Lấy danh sách lịch hẹn theo patientId
 * - Chỉ lấy các bản ghi chưa bị xóa (deletedAt = null)
 * - Populate thông tin service và doctor
 */
const getAppointmentsByPatientId = async (patientId) => {
    return await AppointmentModel.find({
        patientId,
        deletedAt: null,
    })
        .populate('serviceId') // join thông tin dịch vụ
        .populate('doctorId')  // join thông tin bác sĩ
        .lean();               // trả về plain object
};

/**
 * Lấy danh sách lịch hẹn theo doctorId
 * - Populate service và patient
 * - Sắp xếp theo thời gian giảm dần (mới nhất trước)
 */
const getAppointmentsByDoctorId = async (doctorId) => {
    return await AppointmentModel.find({
        doctorId,
        deletedAt: null,
    })
        .populate('serviceId')
        .populate('patientId')
        .sort({ appointmentDateTime: -1 })
        .lean();
};

/**
 * Lấy chi tiết lịch hẹn theo ID
 */
const getAppointmentById = (id) => {
    return AppointmentModel.findById(id);
};

/**
 * Tìm và cập nhật 1 lịch hẹn
 * - filter: điều kiện tìm
 * - update: dữ liệu cập nhật
 * - options:
 *   + new: true → trả về dữ liệu sau update
 *   + runValidators: kiểm tra schema
 */
const findOneAndUpdateAppointment = (filter, update, options = {}) => {
    return AppointmentModel.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
        ...options,
    });
};

/**
 * Tìm danh sách lịch hẹn theo điều kiện bất kỳ
 */
const find = async (data) => {
    return await AppointmentModel.find(data);
};

/**
 * Lấy toàn bộ lịch hẹn
 */
const getAppointments = async () => {
    return await AppointmentModel.find({});
};

/**
 * Export model và các hàm thao tác
 */
export const appointmentModel = {
    APPOINTMENT_STATUS,
    AppointmentModel,
    createNew,
    getAppointmentsByPatientId,
    getAppointmentsByDoctorId,
    getAppointmentById,
    findOneAndUpdateAppointment,
    find,
    getAppointments,
};