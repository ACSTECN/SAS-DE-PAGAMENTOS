import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, CreditCard, FileClock, LayoutDashboard, LogOut, Upload } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

const navItems = [
  { to: '/app', label: 'Painel', icon: LayoutDashboard },
  { to: '/app/conexao-bancaria', label: 'Conta Inter', icon: Building2 },
  { to: '/app/pagamentos/novo', label: 'PIX unitário', icon: CreditCard },
  { to: '/app/lotes/novo', label: 'Novo lote', icon: Upload },
  { to: '/app/lotes', label: 'Histórico', icon: FileClock },
];

export function AppShell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-72 flex-col border-r border-white/10 bg-slate-950/80 px-6 py-8 lg:flex">
          <Link to="/app" className="mb-10 block">
            <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/80">Orquestra PIX</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-white">Pagamentos B2B</div>
            <p className="mt-3 text-sm text-slate-400">
              Operação multiempresa para pagamentos unitários e em lote.
            </p>
          </Link>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                      isActive
                        ? 'bg-cyan-400/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1">
          <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
            <div className="flex items-center justify-between px-6 py-5 lg:px-10">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-500">Empresa ativa</div>
                <div className="mt-2 text-xl font-semibold text-white">{user?.companyName}</div>
              </div>

              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                  <div className="text-sm font-medium text-white">{user?.name}</div>
                  <div className="text-xs text-slate-400">{user?.email}</div>
                </div>

                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200"
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            </div>
          </header>

          <main className="px-6 py-8 lg:px-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
