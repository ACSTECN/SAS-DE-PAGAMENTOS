import { useEffect, useState } from 'react';
import { Building2, CreditCard, Users2, Wallet2, Plus, Download, Sparkles, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminCompanySummary } from '@/lib/types';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/SectionCard';

type PlatformSummary = {
  total_companies: number;
  validated_connections: number;
  total_batches: number;
  completed_batches: number;
  failed_batches: number;
  total_items: number;
  total_amount: string;
};

const sampleCsv = `payment_id,recipient_name,recipient_document,pix_key,amount,description
PAG-001,Ana Paula Souza,12345678909,ana.souza@email.com,150.50,Pagamento fornecedor semana 1
PAG-002,Joao Pereira Ltda,12345678000190,11999998888,2400.00,Repasse contrato comercial
PAG-003,Marcos Lima,98765432100,123e4567-e12b-12d1-a456-426614174000,89.90,Pagamento colaborador avulso
PAG-004,Carla Mendes,23456789012,c.mendes@empresa.io,3150.75,Adiantamento quinzenal
`;

function downloadSampleCsv() {
  const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'modelo-planilha-pix.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function SuperAdminPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [companies, setCompanies] = useState<AdminCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyName, setCompanyName] = useState('');
  const [companyDocument, setCompanyDocument] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.get<{ summary: PlatformSummary }>('/api/admin/platform-summary'),
      api.get<{ companies: AdminCompanySummary[] }>('/api/admin/companies'),
    ])
      .then(([s, c]) => {
        setSummary(s.summary);
        setCompanies(c.companies);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreateLoading(true);
    try {
      const response = await api.post<{
        company: { id: string; name: string };
        owner: { email: string; password?: string };
        message: string;
      }>('/api/admin/companies', {
        companyName,
        companyDocument,
        ownerName,
        ownerEmail,
        ownerPassword,
      });
      setCreateSuccess(
        `Empresa "${response.company.name}" criada. Login do responsável: ${response.owner.email} / senha: ${ownerPassword}.`,
      );
      setCompanyName('');
      setCompanyDocument('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      const refreshed = await api.get<{ companies: AdminCompanySummary[] }>('/api/admin/companies');
      setCompanies(refreshed.companies);
      const refreshedSummary = await api.get<{ summary: PlatformSummary }>('/api/admin/platform-summary');
      setSummary(refreshedSummary.summary);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Falha ao criar empresa.');
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Empresas ativas"
          value={loading ? '...' : String(summary?.total_companies ?? 0)}
          hint="Total de clientes onboardados na plataforma."
          icon={Users2}
        />
        <MetricCard
          label="Contas Asaas validadas"
          value={loading ? '...' : String(summary?.validated_connections ?? 0)}
          hint="Clientes que já conectaram e validaram a própria conta Asaas."
          icon={CheckCircle2}
        />
        <MetricCard
          label="Repasses processados"
          value={loading ? '...' : String(summary?.total_items ?? 0)}
          hint="Quantidade de PIX executados em toda a plataforma."
          icon={CreditCard}
        />
        <MetricCard
          label="Volume transacionado"
          value={loading ? '...' : `R$ ${Number(summary?.total_amount ?? 0).toFixed(2)}`}
          hint="Somatório de todos os lotes enviados."
          icon={Wallet2}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Cadastrar novo cliente"
          subtitle="Cria a empresa e já entrega o usuário administrador (login + senha) para o dono."
        >
          <form className="space-y-4" onSubmit={handleCreateCompany}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Empresa</div>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  placeholder="Ex: Construtora Alfa Ltda"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
              <label className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">CNPJ</div>
                <input
                  value={companyDocument}
                  onChange={(e) => setCompanyDocument(e.target.value)}
                  required
                  placeholder="Somente números"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
              <label className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Nome do responsável</div>
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  required
                  placeholder="Nome do dono / administrador"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
              <label className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">E-mail do responsável</div>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  required
                  placeholder="dono@empresa.com.br"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
              <label className="md:col-span-2 space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Senha temporária</div>
                <input
                  type="text"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Ex: Cliente@2026 (mínimo 6 caracteres)"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={createLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {createLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {createLoading ? 'Criando...' : 'Criar empresa + usuário'}
            </button>

            {createError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {createError}
              </div>
            ) : null}

            {createSuccess ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <div className="font-semibold text-emerald-300 flex items-center gap-2"><Sparkles size={16}/>Pronto</div>
                <div className="mt-1">{createSuccess}</div>
              </div>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard
          title="Preparativos do cliente"
          subtitle="Checklist para você entregar ao novo cliente colocar em operação."
        >
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="font-medium text-white">1. Enviar login e senha</div>
              <p className="mt-1 text-slate-400">
                Envie o e-mail do responsável e a senha temporária criada acima. Orientar a trocar a senha no primeiro acesso.
              </p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="font-medium text-white">2. Conectar conta Asaas</div>
              <p className="mt-1 text-slate-400">
                Menu <span className="text-cyan-300">Conta Asaas</span> → escolher ambiente (sandbox/produção) → colar a API Key dele → clicar em validar.
              </p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="font-medium text-white flex items-center justify-between">
                <span>3. Baixar layout da planilha de repasse</span>
                <button
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20"
                >
                  <Download size={14}/> CSV modelo
                </button>
              </div>
              <p className="mt-1 text-slate-400">
                Preencher, salvar como Excel (.xlsx) ou CSV e subir na tela <span className="text-cyan-300">Novo lote</span>.
              </p>
            </li>
          </ol>
        </SectionCard>
      </div>

      <SectionCard
        title="Carteira de clientes"
        subtitle="Visão geral de todas as empresas onboardadas (não há dados financeiros sensíveis aqui)."
      >
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">CNPJ</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Conexão Asaas</th>
                <th className="px-4 py-3 font-medium text-right">Lotes</th>
                <th className="px-4 py-3 font-medium text-right">PIX enviados</th>
                <th className="px-4 py-3 font-medium text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-200">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Carregando...</td>
                </tr>
              )}
              {!loading && companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Nenhuma empresa cadastrada. Comece criando o primeiro cliente acima.
                  </td>
                </tr>
              ) : null}
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-cyan-400/10 p-2 text-cyan-200"><Building2 size={16}/></div>
                      <div>
                        <div className="font-medium text-white">{company.name}</div>
                        <div className="text-xs text-slate-500">Criada em {new Date(company.created_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{company.document}</td>
                  <td className="px-4 py-3">
                    {company.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                        <CheckCircle2 size={12}/> Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-xs text-slate-300">
                        <XCircle size={12}/> Inativa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {company.bank_connection_status === 'validated' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                        <CheckCircle2 size={12}/>
                        Validada · {company.bank_connection_environment === 'production' ? 'PROD' : 'SBX'}
                      </span>
                    ) : company.bank_connection_status === 'error' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-200">
                        <XCircle size={12}/> Erro
                      </span>
                    ) : company.bank_connection_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                        Pendente
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Não conectada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-slate-200">{company.total_batches}</div>
                    <div className="text-[11px] text-slate-500">
                      ✅ {company.total_completed_batches} · ❌ {company.total_failed_batches}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200">{company.total_items}</td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    R$ {Number(company.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
