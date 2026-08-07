/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

let cachedApp: typeof import('../_api/app.js').default | null = null;
let cachedSetupError: { statusCode: number; message: string } | null = null;

function setupApp() {
  if (cachedApp || cachedSetupError) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../_api/app.js');
    cachedApp = (mod.default || mod) as typeof import('../_api/app.js').default;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cachedSetupError = {
      statusCode: 500,
      message:
        message.length > 10
          ? message
          : 'Falha ao inicializar a API. Verifique as Environment Variables configuradas na Vercel e faça Redeploy.',
    };
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  setupApp();

  if (cachedSetupError) {
    res.status(cachedSetupError.statusCode).setHeader('Content-Type', 'application/json').json({
      success: false,
      error: cachedSetupError.message,
    });
    return;
  }

  try {
    if (!cachedApp) throw new Error('App não inicializado.');
    cachedApp(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).setHeader('Content-Type', 'application/json').json({
      success: false,
      error: message || 'Erro interno do servidor.',
    });
  }
}
