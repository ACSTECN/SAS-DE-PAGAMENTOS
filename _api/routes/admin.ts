import { Router, type Request, type Response } from 'express';
import { asyncHandler, ApiError } from '../lib/api-error.js';
import { requireAuth, requireSuperAdmin, type AuthenticatedRequest } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get(
  '/companies',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const { data: companies, error: companiesError } = await supabaseAdmin
      .from('companies')
      .select(
        `
          id,
          name,
          document,
          status,
          created_at,
          users:company_users(count),
          bank_connections(status, environment),
          batches(
            id,
            status,
            total_items,
            total_amount
          )
        `,
      )
      .order('created_at', { ascending: false });

    if (companiesError) {
      throw new ApiError(500, 'Falha ao carregar empresas.');
    }

    const summaries = (companies ?? []).map((c: unknown) => {
      const row = c as {
        id: string;
        name: string;
        document: string;
        status: 'active' | 'inactive';
        created_at: string;
        users?: Array<{ count: number }>;
        bank_connections?: Array<{ status: 'pending' | 'validated' | 'error'; environment: 'sandbox' | 'production' }>;
        batches?: Array<{
          id: string;
          status: string;
          total_items: number;
          total_amount: string | number;
        }>;
      };

      const users = (row.users ?? []) as Array<{ count: number }>;
      const connections = row.bank_connections ?? [];
      const batches = row.batches ?? [];
      const connection = connections[0];

      let totalAmount = 0;
      let totalItems = 0;
      let completed = 0;
      let failed = 0;

      for (const batch of batches) {
        totalAmount += Number(batch.total_amount || 0);
        totalItems += Number(batch.total_items || 0);
        if (batch.status === 'completed') completed += 1;
        if (batch.status === 'failed' || batch.status === 'partial') failed += 1;
      }

      return {
        id: row.id,
        name: row.name,
        document: row.document,
        status: row.status,
        created_at: row.created_at,
        bank_connection_status: connection ? connection.status : 'none',
        bank_connection_environment: connection ? connection.environment : null,
        total_batches: batches.length,
        total_items: totalItems,
        total_amount: totalAmount.toFixed(2),
        total_completed_batches: completed,
        total_failed_batches: failed,
        users_count: users[0]?.count ?? 0,
      };
    });

    res.json({
      success: true,
      companies: summaries,
    });
  }),
);

router.post(
  '/companies',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      companyName,
      companyDocument,
      ownerName,
      ownerEmail,
      ownerPassword,
    } = (req.body ?? {}) as {
      companyName?: string;
      companyDocument?: string;
      ownerName?: string;
      ownerEmail?: string;
      ownerPassword?: string;
    };

    if (!companyName || !companyDocument || !ownerName || !ownerEmail || !ownerPassword) {
      throw new ApiError(400, 'Preencha empresa, documento, nome, e-mail e senha do responsável.');
    }

    if (ownerPassword.length < 6) {
      throw new ApiError(400, 'A senha do responsável deve ter no mínimo 6 caracteres.');
    }

    const { data: userCreation, error: userCreationError } =
      await supabaseAdmin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
      });

    if (userCreationError || !userCreation.user) {
      throw new ApiError(400, userCreationError?.message || 'Falha ao criar usuário do responsável.');
    }

    const authUserId = userCreation.user.id;
    let companyId: string | null = null;

    try {
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .insert({
          name: companyName,
          document: companyDocument,
        })
        .select('id, name, document, status')
        .single();

      if (companyError || !company) {
        throw new ApiError(400, companyError?.message || 'Falha ao criar empresa.');
      }
      companyId = company.id;

      const { error: profileError } = await supabaseAdmin.from('users').insert({
        id: authUserId,
        name: ownerName,
        email: ownerEmail,
        active: true,
      });

      if (profileError) {
        throw new ApiError(400, profileError.message || 'Falha ao criar perfil do responsável.');
      }

      const { error: membershipError } = await supabaseAdmin.from('company_users').insert({
        company_id: company.id,
        user_id: authUserId,
        role: 'admin',
      });

      if (membershipError) {
        throw new ApiError(400, membershipError.message || 'Falha ao vincular responsável à empresa.');
      }

      res.status(201).json({
        success: true,
        company,
        owner: {
          id: authUserId,
          name: ownerName,
          email: ownerEmail,
        },
        message: 'Empresa e responsável criados com sucesso. Envie as credenciais ao cliente.',
      });
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (companyId) {
        await supabaseAdmin.from('companies').delete().eq('id', companyId);
      }
      throw err;
    }
  }),
);

router.get(
  '/platform-summary',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const { count: companiesCount, error: countErr } = await supabaseAdmin
      .from('companies')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw new ApiError(500, 'Falha ao carregar estatísticas.');

    const { data: batches, error: batchesErr } = await supabaseAdmin
      .from('batches')
      .select('status, total_amount, total_items');

    if (batchesErr) throw new ApiError(500, 'Falha ao carregar lotes.');

    let totalAmount = 0;
    let totalItems = 0;
    let completedBatches = 0;
    let failedBatches = 0;

    for (const batch of (batches ?? []) as Array<{ status: string; total_amount: string | number; total_items: number }>) {
      totalAmount += Number(batch.total_amount || 0);
      totalItems += Number(batch.total_items || 0);
      if (batch.status === 'completed') completedBatches += 1;
      if (batch.status === 'failed' || batch.status === 'partial') failedBatches += 1;
    }

    const { count: validatedConnections, error: bcErr } = await supabaseAdmin
      .from('bank_connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'validated');

    if (bcErr) throw new ApiError(500, 'Falha ao carregar conexões.');

    res.json({
      success: true,
      summary: {
        total_companies: companiesCount ?? 0,
        validated_connections: validatedConnections ?? 0,
        total_batches: (batches ?? []).length,
        completed_batches: completedBatches,
        failed_batches: failedBatches,
        total_items: totalItems,
        total_amount: totalAmount.toFixed(2),
      },
    });
  }),
);

export default router;
