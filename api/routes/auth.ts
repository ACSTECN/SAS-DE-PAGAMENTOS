import { Router, type Request, type Response } from 'express';
import { asyncHandler, ApiError } from '../lib/api-error.js';
import { getUserContextFromAccessToken } from '../lib/auth.js';
import { supabaseAdmin, supabasePublic } from '../lib/supabase.js';

const router = Router();

router.post(
  '/register-company',
  asyncHandler(async (req: Request, res: Response) => {
    const { companyName, companyDocument, name, email, password } = req.body ?? {};

    if (!companyName || !companyDocument || !name || !email || !password) {
      throw new ApiError(400, 'Preencha empresa, documento, nome, e-mail e senha.');
    }

    const { data: userCreation, error: userCreationError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (userCreationError || !userCreation.user) {
      throw new ApiError(400, userCreationError?.message || 'Falha ao criar usuário.');
    }

    const authUserId = userCreation.user.id;

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: companyName,
        document: companyDocument,
      })
      .select('id, name, document, status')
      .single();

    if (companyError || !company) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new ApiError(400, companyError?.message || 'Falha ao criar empresa.');
    }

    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authUserId,
      name,
      email,
      active: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new ApiError(400, profileError.message || 'Falha ao criar perfil do usuário.');
    }

    const { error: membershipError } = await supabaseAdmin.from('company_users').insert({
      company_id: company.id,
      user_id: authUserId,
      role: 'admin',
    });

    if (membershipError) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new ApiError(400, membershipError.message || 'Falha ao vincular usuário à empresa.');
    }

    res.status(201).json({
      success: true,
      company,
      message: 'Empresa criada com sucesso. Faça login para continuar.',
    });
  }),
);

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
