import { Router, type Request, type Response } from 'express';
import { asyncHandler, ApiError } from '../lib/api-error.js';
import { getUserContextFromAccessToken } from '../lib/auth.js';
import { supabasePublic } from '../lib/supabase.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw new ApiError(400, 'Informe e-mail e senha.');
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new ApiError(401, error?.message || 'Credenciais inválidas.');
    }

    const user = await getUserContextFromAccessToken(data.session.access_token);

    res.json({
      success: true,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
      user,
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
    });
  }),
);

export default router;
