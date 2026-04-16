import { serviceModel } from '~/models/service.model';
import { StatusCodes } from 'http-status-codes';
import ApiError from '~/utils/ApiError';
const getAllServices = async () => {
    const result = await serviceModel.getAllServices();
    if (!result) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy dịch vụ!');
    return result;
};

export const serviceService = {
    getAllServices
}
