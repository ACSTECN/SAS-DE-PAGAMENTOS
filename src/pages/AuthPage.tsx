import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { AppSession, AppUser } from '@/lib/types';
import { useAuthStore } from '@/store/auth';

const initialRegister = {
  companyName: '',
  companyDocument: '',
  name: '',
  email: '',
  password: '',
};

const initialLogin = {
  email: '',
  password: '',
};

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);

  const heroTitle = useMemo(
    () =>
      mode === 'login'
        ? 'Controle seus pagamentos sem planilhas espalhadas.'
        : 'Crie sua operação PIX B2B e conecte a conta Inter Empresas da sua empresa.',
    [mode],
  );

  if (user) {
    return <Navigate to="/app" replace />;
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.post<{ message: string }>('/api/auth/register-company', registerForm);
      setFeedback(response.message);
      setMode('login');
      setLoginForm({ email: registerForm.email, password: registerForm.password });
      setRegisterForm(initialRegister);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao criar empresa.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await api.post<{ session: AppSession; user: AppUser }>('/api/auth/login', loginForm);
      setSession(response.session);
      setUser(response.user);
      navigate('/app');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

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
              {heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Multiempresa, conexão Banco Inter por cliente, pagamento unitário e em lote, execução via API e histórico operacional em um único cockpit.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Multiempresa', 'Cada empresa acessa apenas os próprios usuários, lotes e resultados.'],
              ['Conta própria', 'A execução acontece diretamente na conta bancária do cliente.'],
              ['Operação rápida', 'PIX unitário, lote, erros por item e nova tentativa manual.'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="text-sm font-medium text-white">{title}</div>
                <div className="mt-3 text-sm leading-6 text-slate-400">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[36px] border border-white/10 bg-slate-900/80 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.5)] lg:p-10">
          <div className="mb-8 flex rounded-full border border-white/10 bg-slate-950/70 p-1">
            {[
              ['login', 'Entrar'],
              ['register', 'Criar empresa'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setMode(value as 'login' | 'register');
                  setError(null);
                  setFeedback(null);
                }}
                className={`flex-1 rounded-full px-4 py-3 text-sm transition ${
                  mode === value ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'register' ? (
            <form className="space-y-4" onSubmit={handleRegister}>
              {[
                ['companyName', 'Nome da empresa'],
                ['companyDocument', 'CNPJ ou documento'],
                ['name', 'Nome do administrador'],
                ['email', 'E-mail'],
                ['password', 'Senha'],
              ].map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm text-slate-300">{label}</span>
                  <input
                    type={field === 'password' ? 'password' : 'text'}
                    value={registerForm[field as keyof typeof registerForm]}
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                    required
                  />
                </label>
              ))}

              <button
                disabled={loading}
                className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
              >
                {loading ? 'Criando empresa...' : 'Criar empresa'}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleLogin}>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">E-mail</span>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Senha</span>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                  required
                />
              </label>

              <button
                disabled={loading}
                className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
              >
                {loading ? 'Entrando...' : 'Entrar no cockpit'}
              </button>
            </form>
          )}

          {feedback ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{feedback}</div> : null}
          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        </section>
      </div>
    </div>
  );
}
