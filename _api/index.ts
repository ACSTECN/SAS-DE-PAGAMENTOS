/**
 * Local development entry mirror (kept for reference)
 * The real Vercel deploy entry is now at /api/index.ts at project root.
 */
import app from './app.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}