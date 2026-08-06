import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { BankConnection } from '@/lib/types';
import { SectionCard } from '@/components/SectionCard';

const initialForm = {
  apiKey: '',
  environment: 'sandbox' as 'sandbox' | 'production',
};

type AsaasForm = typeof initialForm;

function formatLastTestedAt(lastTestedAt?: string) {
  if (!lastTestedAt) return '-';
  try {
    return new Date(lastTestedAt).toLocaleString('pt-BR');
  } catch {
    return lastTestedAt;
  }
}

export function BankConnectionPage() {
  const [form, setForm] = useState<AsaasForm>(initialForm);
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function loadConnection() {
    const response = await api.get<{
      connection: BankConnection | null;
      provider: 'asaas';
    }>('/api/bank-connections');

    setConnection(response.connection);
    if (response.connection) {
      setForm((current) => ({
        ...current,
        environment: response.connection!.environment,
      }));
    }
  }

  useEffect(() => {
    void loadConnection();
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.post<{ message: string; environment: 'sandbox' | 'production' }>(
        '/api/bank-connections',
        form,
      );
      setFeedback(response.message);
      await loadConnection();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao salvar conexão.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.post<{ message: string }>('/api/bank-connections/test');
      setFeedback(response.message);
      await loadConnection();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao testar conexão.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('Deseja mesmo remover a conexão Asaas desta empresa?')) return;
    setRemoving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.delete<{ message: string }>('/api/bank-connections');
      setFeedback(response.message);
      setConnection(null);
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao remover conexão.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionCard
        title="Conectar Asaas"
        subtitle="Informe a API Key da sua conta Asaas. Cada empresa usa a sua própria credencial, garantindo total isolamento."
        action={
          connection ? (
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={loading}
                className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-60"
              >
                Validar novamente
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200 transition hover:bg-red-400/20 disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 size={16} />
                  {removing ? 'Removendo...' : 'Remover'}
                </span>
              </button>
            </div>
          ) : null
        }
      >
        <div className="mb-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Banco integrado</div>
            <div className="mt-3 flex items-center gap-3 text-xl font-medium text-white">
              <img
                src="https://asaas.com/images/brand/asaas-logo-primary.svg"
                alt="Asaas"
                className="h-6 w-auto"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              Asaas Conta Digital
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Ambiente atual</div>
            <div className="mt-3 text-xl font-medium text-white">
              {connection?.environment === 'production' ? 'Produção' : 'Sandbox'}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Status da conexão</div>
            <div className="mt-3 flex flex-col gap-2 text-xl font-medium text-white">
              <div className="flex items-center gap-3">
                {connection?.status === 'validated' ? (
                  <>
                    <CheckCircle2 className="text-emerald-300" size={20} />
                    Conectado
                  </>
                ) : connection?.status === 'error' ? (
                  <>
                    <XCircle className="text-red-300" size={20} />
                    Com erro
                  </>
                ) : (
                  <>
                    <ShieldCheck className="text-amber-300" size={20} />
                    Pendente
                  </>
                )}
              </div>
              <div className="text-sm font-normal text-slate-400">
                Último teste: {formatLastTestedAt(connection?.lastTestedAt)}
              </div>
            </div>
          </div>
        </div>

        <form className="grid gap-4 xl:grid-cols-2" onSubmit={handleSave}>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Ambiente</span>
            <select
              value={form.environment}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  environment: event.target.value as 'sandbox' | 'production',
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            >
              <option value="sandbox">Sandbox - homologação</option>
              <option value="production">Produção</option>
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            Crie sua API Key no painel Asaas: Configurações &gt; Integrações &gt; API Key.
            Copie apenas uma chave do ambiente selecionado acima.
          </div>

          <label className="block xl:col-span-2">
            <span className="mb-2 block text-sm text-slate-300">API Key Asaas</span>
            <input
              type="password"
              value={form.apiKey}
              placeholder="$aact_Yz... (exemplo da documentação Asaas)"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              required
            />
          </label>

          <div className="xl:col-span-2 flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm text-slate-300">Validação automática ao salvar</div>
              <div className="mt-2 text-lg font-medium text-white">
                O botão conecta e já realiza um ping de validação na conta Asaas da empresa.
              </div>
            </div>

            <button
              disabled={loading}
              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading ? 'Conectando Asaas...' : 'Conectar Asaas'}
            </button>
          </div>
        </form>

        {feedback ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {feedback}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {!error && connection?.validationMessage ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            Último retorno: {connection.validationMessage}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
