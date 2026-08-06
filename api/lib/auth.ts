import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './api-error.js';
import { supabaseAdmin } from './supabase.js';
import type { SessionUser } from '../types/index.js';

export type AuthenticatedRequest = Request & {
  currentUser?: SessionUser;
};

async function resolveUserContext(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('company_users')
    .select(
      `
        role,
        company:companies!inner(id, name, status),
        user:users!inner(id, email, name, active)
      `,
    )
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Falha ao carregar contexto do usuário.');
  }

  if (!data || !data.user || !data.company) {
    throw new ApiError(403, 'Usuário não vinculado a nenhuma empresa.');
  }

  const company = Array.isArray(data.company) ? data.company[0] : data.company;
  const user = Array.isArray(data.user) ? data.user[0] : data.user;

  if (!company || !user) {
    throw new ApiError(403, 'Contexto inválido para o usuário autenticado.');
  }

  if (!user.active || company.status !== 'active') {
    throw new ApiError(403, 'Usuário ou empresa inativos.');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: data.role,
    companyId: company.id,
    companyName: company.name,
  } satisfies SessionUser;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      throw new ApiError(401, 'Sessão ausente.');
    }

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new ApiError(401, 'Sessão inválida.');
    }

    req.currentUser = await resolveUserContext(user.id);
    next();
  } catch (error) {
    next(error);
  }
}

export async function getUserContextFromAccessToken(accessToken: string) {
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    throw new ApiError(401, 'Sessão inválida.');
  }

  return resolveUserContext(user.id);
}
