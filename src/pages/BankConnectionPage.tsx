import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { BankConnection, BankProvider } from '@/lib/types';
import { SectionCard } from '@/components/SectionCard';

const PROVIDERS: Array<{ value: BankProvider; label: string; hint: string }> = [
  {
    value: 'asaas',
    label: 'Asaas',
    hint: 'Conta digital com API Key direta. Ideal para pequenas e médias empresas.',
  },
  {
    value: 'inter',
    label: 'Banco Inter',
    hint: 'OAuth2 + mTLS com certificado PEM. Ideal para empresas já no Inter.',
  },
];

type AsaasForm = {
  provider: 'asaas';
  environment: 'sandbox' | 'production';
  apiKey: string;
};

type InterForm = {
  provider: 'inter';
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

type BankForm = AsaasForm | InterForm;

const initialAsaas: AsaasForm = {
  provider: 'asaas',
  environment: 'sandbox',
  apiKey: '',
};

const initialInter: InterForm = {
  provider: 'inter',
  environment: 'sandbox',
  clientId: '',
  clientSecret: '',
  certificatePem: '',
  privateKeyPem: '',
};

function formatLastTestedAt(lastTestedAt?: string) {
  if (!lastTestedAt) return '-';
  try {
    return new Date(lastTestedAt).toLocaleString('pt-BR');
  } catch {
    return lastTestedAt;
  }
}

function getProviderDisplay(provider: BankProvider) {
  if (provider === 'asaas') return 'Asaas';
  return 'Banco Inter';
}

export function BankConnectionPage() {
  const [form, setForm] = useState<BankForm>(initialAsaas);
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function loadConnection() {
    const response = await api.get<{
      connection: BankConnection | null;
      provider: BankProvider;
    }>('/api/bank-connections');

    setConnection(response.connection);
    if (response.connection) {
      const env = response.connection.environment;
      if (response.connection.provider === 'inter') {
        setForm({ ...initialInter, environment: env });
      } else {
        setForm({ ...initialAsaas, environment: env });
      }
    }
  }

  useEffect(() => {
    void loadConnection();
  }, []);

  function switchProvider(provider: BankProvider) {
    setError(null);
    setFeedback(null);
    if (provider === 'inter') {
      setForm({ ...initialInter, environment: form.environment });
    } else {
      setForm({ ...initialAsaas, environment: form.environment });
    }
  }

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
    if (
      !window.confirm(
        `Deseja mesmo remover a conexão ${getProviderDisplay(form.provider)} desta empresa?`,
      )
    )
      return;
    setRemoving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.delete<{ message: string }>('/api/bank-connections');
      setFeedback(response.message);
      setConnection(null);
      setForm(initialAsaas);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao remover conexão.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionCard
        title="Conectar banco"
        subtitle="Escolha entre Asaas ou Banco Inter. Cada empresa usa a sua própria credencial, garantindo total isolamento."
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
              {connection ? (
                <>
                  {connection.provider === 'asaas' ? (
                    <img
                      src="https://asaas.com/images/brand/asaas-logo-primary.svg"
                      alt="Asaas"
                      className="h-6 w-auto"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  {getProviderDisplay(connection.provider)}
                </>
              ) : (
                'Selecione o provider abaixo'
              )}
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

        <form className="grid gap-4" onSubmit={handleSave}>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="mb-3 text-sm text-slate-300">Escolha o banco</div>
            <div className="grid gap-3 md:grid-cols-2">
              {PROVIDERS.map((provider) => {
                const selected = form.provider === provider.value;
                return (
                  <button
                    type="button"
                    key={provider.value}
                    onClick={() => switchProvider(provider.value)}
                    className={`rounded-2xl border px-5 py-4 text-left transition ${
                      selected
                        ? 'border-cyan-400/50 bg-cyan-400/10'
                        : 'border-white/10 bg-slate-950/70 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold text-white">{provider.label}</div>
                      {selected ? (
                        <CheckCircle2 className="text-cyan-300" size={18} />
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{provider.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
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

            {form.provider === 'asaas' ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                Crie sua API Key no painel Asaas: Configurações &gt; Integrações &gt; API Key.
                Copie apenas uma chave do ambiente selecionado acima.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                Acesse o Portal de Desenvolvedores Inter: Minha Conta &gt; Aplicações.
                Copie Client ID, Client Secret e cole o certificado PEM + chave privada PEM do
                ambiente selecionado.
              </div>
            )}

            {form.provider === 'asaas' ? (
              <label className="block xl:col-span-2">
                <span className="mb-2 block text-sm text-slate-300">API Key Asaas</span>
                <input
                  type="password"
                  value={form.apiKey}
                  placeholder="$aact_Yz... (exemplo da documentação Asaas)"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...(current as AsaasForm),
                      apiKey: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                  required
                />
              </label>
            ) : null}

            {form.provider === 'inter' ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Client ID</span>
                  <input
                    type="text"
                    value={form.clientId}
                    placeholder="Ex: 6a8f4...-inter-client-id"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...(current as InterForm),
                        clientId: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Client Secret</span>
                  <input
                    type="password"
                    value={form.clientSecret}
                    placeholder="••••••••••••••••"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...(current as InterForm),
                        clientSecret: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                    required
                  />
                </label>
                <label className="block xl:col-span-2">
                  <span className="mb-2 block text-sm text-slate-300">
                    Certificado PEM (-----BEGIN CERTIFICATE-----)
                  </span>
                  <textarea
                    rows={6}
                    value={form.certificatePem}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...conteúdo do certificado...&#10;-----END CERTIFICATE-----"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...(current as InterForm),
                        certificatePem: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-cyan-400/60"
                    required
                  />
                </label>
                <label className="block xl:col-span-2">
                  <span className="mb-2 block text-sm text-slate-300">
                    Chave privada PEM (-----BEGIN PRIVATE KEY-----)
                  </span>
                  <textarea
                    rows={6}
                    value={form.privateKeyPem}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...conteúdo da chave privada...&#10;-----END PRIVATE KEY-----"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...(current as InterForm),
                        privateKeyPem: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-cyan-400/60"
                    required
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm text-slate-300">Validação automática ao salvar</div>
              <div className="mt-2 text-lg font-medium text-white">
                O botão conecta e já realiza um ping de validação na conta{' '}
                {getProviderDisplay(form.provider)} da empresa.
              </div>
            </div>

            <button
              disabled={loading}
              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading
                ? `Conectando ${getProviderDisplay(form.provider)}...`
                : `Conectar ${getProviderDisplay(form.provider)}`}
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
