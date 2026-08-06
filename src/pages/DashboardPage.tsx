import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { BankConnection, Batch } from '@/lib/types';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/SectionCard';

export function DashboardPage() {
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    void Promise.all([
      api.get<{ connection: BankConnection | null }>('/api/bank-connections/inter'),
      api.get<{ batches: Batch[] }>('/api/batches'),
    ]).then(([connectionResponse, batchResponse]) => {
      setConnection(connectionResponse.connection);
      setBatches(batchResponse.batches.slice(0, 5));
    });
  }, []);

  const totalAmount = batches.reduce((sum, batch) => sum + Number(batch.total_amount), 0);
  const failedBatches = batches.filter((batch) => batch.status === 'failed').length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Conta Inter"
          value={connection?.status === 'validated' ? 'Validada' : 'Pendente'}
          hint={connection ? `Client ID: ${connection.clientId}` : 'Configure a conexão bancária da empresa.'}
        />
        <MetricCard label="Lotes recentes" value={String(batches.length)} hint="Últimas operações registradas no cockpit." />
        <MetricCard label="Volume recente" value={`R$ ${totalAmount.toFixed(2)}`} hint="Somatório dos lotes carregados nesta visão inicial." />
        <MetricCard label="Lotes com falha" value={String(failedBatches)} hint="Use a tela de histórico para revisar erros e reprocessar itens." />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Próximos passos"
          subtitle="Use esta sequência para colocar a empresa em produção o mais rápido possível."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['1', 'Validar conexão Inter', '/app/conexao-bancaria'],
              ['2', 'Enviar primeiro lote', '/app/lotes/novo'],
              ['3', 'Fazer um PIX unitário', '/app/pagamentos/novo'],
              ['4', 'Revisar histórico', '/app/lotes'],
            ].map(([step, label, to]) => (
              <Link
                key={step}
                to={to}
                className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 transition hover:border-cyan-400/30 hover:bg-slate-950"
              >
                <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">Etapa {step}</div>
                <div className="mt-4 text-lg font-medium text-white">{label}</div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Status operacional" subtitle="Resumo da empresa autenticada no SaaS.">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="text-sm text-slate-400">Conectividade bancária</div>
              <div className="mt-3 text-xl font-semibold text-white">
                {connection?.status === 'validated'
                  ? 'A conta está pronta para pagamento.'
                  : 'A conta ainda precisa ser validada.'}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="text-sm text-slate-400">Modo de operação</div>
              <div className="mt-3 text-xl font-semibold text-white">
                PIX unitário e lote com retorno por item.
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Últimos lotes" subtitle="Visualização rápida das execuções mais recentes.">
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Arquivo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Itens</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-200">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-3">{batch.file_name}</td>
                  <td className="px-4 py-3">{batch.status}</td>
                  <td className="px-4 py-3">{batch.total_items}</td>
                  <td className="px-4 py-3">R$ {Number(batch.total_amount).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <Link className="text-cyan-300 hover:text-cyan-200" to={`/app/lotes/${batch.id}`}>
                      Abrir detalhe
                    </Link>
                  </td>
                </tr>
              ))}
              {!batches.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Nenhum lote encontrado. Crie o primeiro upload para iniciar a operação.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
