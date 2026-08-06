import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';
import { asyncHandler } from '../lib/api-error.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      user: req.currentUser,
    });
  }),
);

export default router;
