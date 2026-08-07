import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppSession, AppUser } from '@/lib/types';
import { useAuthStore } from '@/store/auth';

type LoginForm = {
  email: string;
  password: string;
};

const initialForm: LoginForm = {
  email: '',
  password: '',
};

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'tenant' | 'admin'>('tenant');
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.post<{ session: AppSession; user: AppUser }>('/api/auth/login', form);

      if (mode === 'admin' && response.user.role !== 'super_admin') {
        setError('Este e-mail não é um administrador da plataforma. Use a área "Entrar na minha empresa".');
        setSession(null);
        setUser(null);
        return;
      }

      if (mode === 'tenant' && response.user.role === 'super_admin') {
        setError('Use a área "Acesso Administrador" para entrar como operador da plataforma.');
        setSession(null);
        setUser(null);
        return;
      }

      setSession(response.session);
      setUser(response.user);
      navigate('/app');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

  const panelTitle =
    mode === 'admin' ? 'Acesso administrador da plataforma' : 'Entrar na minha empresa';
  const panelSubtitle =
    mode === 'admin'
      ? 'Área operacional: crie clientes, acompanhe repasses e métricas de toda a plataforma.'
      : 'Conecte a conta Asaas da sua empresa e comece a fazer repasses em lote.';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-6 py-10 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_35%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="flex flex-col justify-between rounded-[36px] border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_rgba(2,6,23,0.55)] lg:p-12">
          <div>
            <div className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-cyan-200">
              SaaS de pagamentos B2B
            </div>
            <h1 className="mt-8 max-w-3xl text-5xl font-semibold leading-tight text-white">
              {mode === 'admin'
                ? 'Gerencie todos os seus clientes e repasses em um único cockpit.'
                : 'Controle seus pagamentos PIX sem planilhas espalhadas.'}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Multiempresa, conexão Asaas individual por cliente, pagamento unitário e em lote,
              execução segura via API e histórico completo. Cada empresa usa a própria conta Asaas.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Multiempresa', 'Cada empresa acessa apenas os próprios usuários, lotes e resultados.'],
              ['Conta própria', 'A execução acontece diretamente na conta Asaas do cliente.'],
              ['Operação rápida', 'PIX unitário, lote, erros por item e nova tentativa manual.'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="text-sm font-medium text-white">{title}</div>
                <div className="mt-3 text-sm leading-6 text-slate-400">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col rounded-[36px] border border-white/10 bg-slate-900/80 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.5)] lg:p-10">
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                    mode === 'admin'
                      ? 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                      : 'border border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {mode === 'admin' ? (
                    <>
                      <ShieldCheck size={13} />
                      Área do operador
                    </>
                  ) : (
                    <>
                      <Building2 size={13} />
                      Área da empresa
                    </>
                  )}
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-white">{panelTitle}</h2>
                <p className="mt-2 text-sm text-slate-400">{panelSubtitle}</p>
              </div>
            </div>
          </div>

          <form className="space-y-4 flex-1 flex flex-col justify-center" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                placeholder={
                  mode === 'admin'
                    ? 'e-mail do administrador da plataforma'
                    : 'voce@suaempresa.com.br'
                }
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Senha</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                placeholder="••••••••"
                required
              />
            </label>

            <button
              disabled={loading}
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading
                ? 'Entrando...'
                : mode === 'admin'
                  ? 'Entrar como administrador'
                  : 'Entrar no cockpit'}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-center border-t border-white/10 pt-6">
            {mode === 'tenant' ? (
              <button
                onClick={() => {
                  setMode('admin');
                  setForm(initialForm);
                  setError(null);
                  setFeedback(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/5 hover:text-cyan-200"
              >
                <ShieldCheck size={14} />
                Sou administrador da plataforma
              </button>
            ) : (
              <button
                onClick={() => {
                  setMode('tenant');
                  setForm(initialForm);
                  setError(null);
                  setFeedback(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/5 hover:text-cyan-200"
              >
                <ArrowLeft size={14} />
                Voltar para login da empresa
              </button>
            )}
          </div>

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
        </section>
      </div>
    </div>
  );
}
