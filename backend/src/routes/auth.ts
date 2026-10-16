import { Router } from 'express';
import { googleSignIn } from '../controllers/auth.js';

export const authRouter = Router();
authRouter.post('/google', googleSignIn);
