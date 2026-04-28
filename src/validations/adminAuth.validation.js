import { z } from 'zod';
import { zodValidate } from '~/utils/zodValidate';

// Schema xác thực dữ liệu đầu vào cho màn hình đăng nhập Admin.
// Sử dụng Zod để khai báo ràng buộc theo kiểu dữ liệu tĩnh (static schema),
// giúp tách biệt hoàn toàn logic xác thực ra khỏi controller và service.
const adminLoginSchema = z.object({
    // Số CCCD (12 chữ số) hoặc CMND cũ (9 chữ số), không chấp nhận định dạng khác.
    // Regex kiểm tra chính xác độ dài, loại bỏ các trường hợp nhập chữ hoặc ký tự đặc biệt.
    nationId: z.string().regex(/^(\d{9}|\d{12})$/, 'cccd/cmnd không hợp lệ'),

    // Mật khẩu tối thiểu 8 ký tự.
    // Có thể mở rộng thêm ràng buộc độ phức tạp (chữ hoa, số, ký tự đặc biệt)
    // nếu chính sách bảo mật yêu cầu trong tương lai.
    password: z.string().min(8),
});

// Bọc schema vào zodValidate để tạo middleware Express sẵn dùng.
// Middleware này sẽ tự động trả về lỗi 422 nếu dữ liệu không hợp lệ,
// không cần viết try/catch thủ công trong controller.
const login = zodValidate(adminLoginSchema);

export const adminAuthValidation = {
    login,
};