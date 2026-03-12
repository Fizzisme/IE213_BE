import bcrypt from 'bcrypt';
import { StatusCodes } from 'http-status-codes';
import { env } from '~/config/environment';
import { userModel } from '~/models/user.model';
import { adminModel } from '~/models/admin.model';
import { JwtProvider } from '~/providers/JwtProvider';
import ApiError from '~/utils/ApiError';

