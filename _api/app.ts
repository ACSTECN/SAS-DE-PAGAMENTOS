import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import bankConnectionRoutes from './routes/bankConnections.js';
import paymentRoutes from './routes/payments.js';
import batchRoutes from './routes/batches.js';
import adminRoutes from './routes/admin.js';
import { env, ensureBackendEnv } from './lib/env.js';
import { ApiError } from './lib/api-error.js';

const app: express.Application = express();

app.use(
  cors({
    origin: [env.appUrl, 'http://localhost:5173'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((_req: Request, _res: Response, next: NextFunction): void => {
  try {
    ensureBackendEnv();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bank-connections', bankConnectionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/batches', batchRoutes);

app.use('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
  });
});

app.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
  void next;

  // Loga ERRO COMPLETO nos logs da Vercel (para voce ver quando abrir a aba Logs)
  // eslint-disable-next-line no-console
  console.error('[API_ERROR]', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  let message = error instanceof ApiError ? error.message : error.message;

  // Se mensagem for vazia ou muito generica, deixa o fallback com stack curto
  if (!message || /^[A-Za-z\s]*internal[A-Za-z\s]*$/i.test(message)) {
    message = `Erro interno (${error.name || 'desconhecido'}) — verifique Environment Variables e os logs da Vercel.`;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    error_name: error.name || undefined,
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Rota de API não encontrada.',
  });
});

export default app;
