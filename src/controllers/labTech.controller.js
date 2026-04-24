import { StatusCodes } from 'http-status-codes';
import { labTechService } from '~/services/labTech.service';

const getMyProfile = async (req, res, next) => {
    try {
        const result = await labTechService.getMyProfile(req.user);
        res.status(StatusCodes.OK).json(result);
    } catch (error) {
        next(error);
    }
};

export const labTechController = {
    getMyProfile,
};
