/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

type AppType = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

let cachedApp: AppType | null = null;
let cachedSetupError: { statusCode: number; message: string } | null = null;

async function setupApp(): Promise<void> {
  if (cachedApp || cachedSetupError) return;

  try {
    const mod = await import('../_api/app.js');
    cachedApp = (mod.default || mod) as AppType;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cachedSetupError = {
      statusCode: 500,
      message:
        message && message.length > 10
          ? message
          : 'Falha ao inicializar a API. Verifique as Environment Variables configuradas na Vercel e faça Redeploy.',
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await setupApp();

  if (cachedSetupError) {
    res
      .status(cachedSetupError.statusCode)
      .setHeader('Content-Type', 'application/json')
      .json({
        success: false,
        error: cachedSetupError.message,
      });
    return;
  }

  try {
    if (!cachedApp) throw new Error('App não inicializado.');
    await Promise.resolve(cachedApp(req, res));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res
      .status(500)
      .setHeader('Content-Type', 'application/json')
      .json({
        success: false,
        error: message || 'Erro interno do servidor.',
      });
  }
}
