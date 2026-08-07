import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './api-error.js';
import { supabaseAdmin } from './supabase.js';
import type { SessionUser } from '../types/index.js';

export type AuthenticatedRequest = Request & {
  currentUser?: SessionUser;
};

const PLATFORM_HOLDING_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const PLATFORM_HOLDING_COMPANY_NAME = 'Plataforma SaaS - Operadora';

async function resolveUserContext(userId: string) {
  const { data: memberships, error } = await supabaseAdmin
    .from('company_users')
    .select(
      `
        role,
        company:companies!inner(id, name, status),
        user:users!inner(id, email, name, active)
      `,
    )
    .eq('user_id', userId)
    .limit(5);

  if (error) {
    throw new ApiError(500, 'Falha ao carregar contexto do usuário.');
  }

  if (!memberships || memberships.length === 0) {
    throw new ApiError(403, 'Usuário não vinculado a nenhuma empresa.');
  }

  const superAdminMembership = memberships.find((m) => m.role === 'super_admin');
  const primaryMembership = superAdminMembership || memberships[0];

  const companyRaw = (primaryMembership as unknown as { company: unknown }).company;
  const userRaw = (primaryMembership as unknown as { user: unknown }).user;

  const company = Array.isArray(companyRaw) ? companyRaw[0] : (companyRaw as { id: string; name: string; status: string } | null);
  const user = Array.isArray(userRaw) ? userRaw[0] : (userRaw as { id: string; email: string; name: string; active: boolean } | null);

  if (!company || !user) {
    throw new ApiError(403, 'Contexto inválido para o usuário autenticado.');
  }

  if (superAdminMembership) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'super_admin',
      companyId: PLATFORM_HOLDING_COMPANY_ID,
      companyName: PLATFORM_HOLDING_COMPANY_NAME,
    } satisfies SessionUser;
  }

  if (!user.active || company.status !== 'active') {
    throw new ApiError(403, 'Usuário ou empresa inativos.');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: primaryMembership.role as 'admin' | 'operator',
    companyId: company.id,
    companyName: company.name,
  } satisfies SessionUser;
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.currentUser || req.currentUser.role !== 'super_admin') {
    return next(new ApiError(403, 'Acesso exclusivo do administrador da plataforma.'));
  }
  next();
}

export function requireTenantUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.currentUser) {
    return next(new ApiError(401, 'Sessão ausente.'));
  }
  if (req.currentUser.role === 'super_admin') {
    return next(new ApiError(403, 'Acesso negado. O administrador da plataforma não executa operações financeiras em nome de clientes.'));
  }
  next();
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
