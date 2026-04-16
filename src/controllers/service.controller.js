import { serviceService } from '~/services/service.service';
const getAllServices = async (req, res) => {
    try {
        const result = await serviceService.getAllServices();
        return res.status(200).json(result);
    } catch (e) {
        return res.status(400).json({
            message: e.message,
        });
    }
};

export const serviceController = {
    getAllServices
}
