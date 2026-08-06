import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { BankConnection } from '@/lib/types';
import { SectionCard } from '@/components/SectionCard';

const initialForm = {
  clientId: '',
  clientSecret: '',
  certificate: '',
  privateKey: '',
  environment: 'sandbox' as 'sandbox' | 'production',
};

export function BankConnectionPage() {
  const [form, setForm] = useState(initialForm);
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadConnection() {
    const response = await api.get<{ connection: BankConnection | null }>('/api/bank-connections/inter');
    setConnection(response.connection);
    if (response.connection) {
      setForm((current) => ({
        ...current,
        clientId: response.connection!.clientId,
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
      const response = await api.post<{ message: string }>('/api/bank-connections/inter', form);
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
      const response = await api.post<{ message: string }>('/api/bank-connections/inter/test');
      setFeedback(response.message);
      await loadConnection();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao testar conexão.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionCard
        title="Conectar Banco Inter"
        subtitle="Informe apenas os dados da aplicação e escolha o ambiente. O sistema configura os endereços do banco automaticamente."
        action={
          connection ? (
            <button
              onClick={handleTest}
              disabled={loading}
              className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-60"
            >
              Validar novamente
            </button>
          ) : null
        }
      >
        <div className="mb-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Banco integrado</div>
            <div className="mt-3 text-xl font-medium text-white">Banco Inter Empresas</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Ambiente atual</div>
            <div className="mt-3 text-xl font-medium text-white">
              {connection?.environment === 'production' ? 'Produção' : 'Sandbox'}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Status da conexão</div>
            <div className="mt-3 flex items-center gap-3 text-xl font-medium text-white">
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
              <option value="sandbox">Sandbox</option>
              <option value="production">Produção</option>
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            O sistema escolhe automaticamente os endereços do Banco Inter conforme o ambiente selecionado.
          </div>

          {[
            ['clientId', 'Client ID', 'text'],
            ['clientSecret', 'Client Secret', 'password'],
          ].map(([field, label, type]) => (
            <label key={field} className="block">
              <span className="mb-2 block text-sm text-slate-300">{label}</span>
              <input
                type={type}
                value={form[field as keyof typeof form]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              />
            </label>
          ))}

          <label className="block xl:col-span-2">
            <span className="mb-2 block text-sm text-slate-300">Certificado PEM</span>
            <textarea
              value={form.certificate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  certificate: event.target.value,
                }))
              }
              rows={8}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </label>

          <label className="block xl:col-span-2">
            <span className="mb-2 block text-sm text-slate-300">Chave privada PEM</span>
            <textarea
              value={form.privateKey}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  privateKey: event.target.value,
                }))
              }
              rows={8}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </label>

          <div className="xl:col-span-2 flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/60 px-5 py-4">
            <div>
              <div className="text-sm text-slate-300">Validação automática ao salvar</div>
              <div className="mt-2 text-lg font-medium text-white">
                O botão conecta e já testa a integração da empresa.
              </div>
            </div>

            <button
              disabled={loading}
              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading ? 'Conectando Banco Inter...' : 'Conectar Banco Inter'}
            </button>
          </div>
        </form>

        {feedback ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{feedback}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {!error && connection?.validationMessage ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            Último retorno: {connection.validationMessage}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
