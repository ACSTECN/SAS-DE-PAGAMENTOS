import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { BankConnection, BankProvider, Batch } from '@/lib/types';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/SectionCard';

const nextSteps: Array<[string, string, string]> = [
  ['1', 'Conectar conta bancária', '/app/conexao-bancaria'],
  ['2', 'Enviar primeiro lote', '/app/lotes/novo'],
  ['3', 'Fazer um PIX unitário', '/app/pagamentos/novo'],
  ['4', 'Revisar histórico', '/app/lotes'],
];

function getProviderDisplay(provider: BankProvider) {
  if (provider === 'c6') return 'C6 Bank';
  if (provider === 'asaas') return 'Asaas';
  return 'Banco Inter';
}

function getAccountLabel(connection: BankConnection | null) {
  if (!connection) return 'Conta bancária';
  return `Conta ${getProviderDisplay(connection.provider)}`;
}

export function DashboardPage() {
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    void Promise.all([
      api.get<{
        connection: BankConnection | null;
        provider: BankProvider;
      }>('/api/bank-connections'),
      api.get<{ batches: Batch[] }>('/api/batches'),
    ]).then(([connectionResponse, batchResponse]) => {
      setConnection(connectionResponse.connection);
      setBatches(batchResponse.batches.slice(0, 5));
    });
  }, []);

  const totalAmount = batches.reduce((sum, batch) => sum + Number(batch.total_amount), 0);
  const failedBatches = batches.filter((batch) => batch.status === 'failed' || batch.status === 'partial').length;
  const successRate = batches.length
    ? batches.filter((batch) => batch.status === 'completed').length / batches.length
    : 0;

  const accountLabel = getAccountLabel(connection);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label={accountLabel}
          value={connection?.status === 'validated' ? 'Validada' : 'Pendente'}
          hint={
            connection
              ? `Ambiente: ${connection.environment === 'production' ? 'Produção' : 'Sandbox'}`
              : `Conecte a conta C6 Bank (principal), Asaas ou Banco Inter da empresa para começar.`
          }
        />
        <MetricCard
          label="Lotes recentes"
          value={String(batches.length)}
          hint="Últimas operações registradas no cockpit."
        />
        <MetricCard
          label="Volume recente"
          value={`R$ ${totalAmount.toFixed(2)}`}
          hint="Somatório dos últimos lotes carregados nesta visão inicial."
        />
        <MetricCard
          label="Sucesso dos lotes"
          value={`${Math.round(successRate * 100)}%`}
          hint={
            failedBatches > 0
              ? `${failedBatches} lote(s) com erro ou parcial. Use o histórico para detalhar.`
              : 'Nenhum lote com falha nesta visão inicial.'
          }
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Próximos passos"
          subtitle="Use esta sequência para colocar a empresa em produção o mais rápido possível."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {nextSteps.map(([step, label, to]) => (
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

        <SectionCard
          title="Status operacional"
          subtitle="Resumo da empresa autenticada no SaaS."
        >
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="text-sm text-slate-400">Conectividade bancária</div>
              <div className="mt-3 text-xl font-semibold text-white">
                {connection?.status === 'validated'
                  ? `A conta ${getProviderDisplay(connection.provider)} está pronta para pagamento.`
                  : 'Conecte a conta C6 Bank (principal), ou use Asaas / Banco Inter como alternativa.'}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="text-sm text-slate-400">Modo de operação</div>
              <div className="mt-3 text-xl font-semibold text-white">
                PIX unitário e lote com retorno por item e retentativa.
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Últimos lotes"
        subtitle="Visualização rápida das execuções mais recentes."
      >
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
                    <Link
                      className="text-cyan-300 hover:text-cyan-200"
                      to={`/app/lotes/${batch.id}`}
                    >
                      Abrir detalhe
                    </Link>
                  </td>
                </tr>
              ))}
              {!batches.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Nenhum lote encontrado. Conecte a conta C6 Bank e crie o primeiro upload.
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
