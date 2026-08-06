import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Batch, BatchItem } from '@/lib/types';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/SectionCard';
import { useAuthStore } from '@/store/auth';

export function BatchDetailPage() {
  const { id } = useParams();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessToken = useAuthStore((state) => state.session?.accessToken);

  const loadBatch = useCallback(async () => {
    if (!id) return;

    const response = await api.get<{ batch: Batch; items: BatchItem[] }>(`/api/batches/${id}`);
    setBatch(response.batch);
    setItems(response.items);
  }, [id]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  const successCount = useMemo(
    () => items.filter((item) => item.status === 'success').length,
    [items],
  );
  const failedCount = useMemo(
    () => items.filter((item) => item.status === 'failed').length,
    [items],
  );
  const invalidCount = useMemo(
    () => items.filter((item) => item.status === 'invalid').length,
    [items],
  );

  async function handleConfirm() {
    if (!id) return;
    setLoading(true);
    setFeedback(null);
    setError(null);

    try {
      await api.post(`/api/batches/${id}/confirm`);
      setFeedback('Lote executado. O resultado por item já está disponível abaixo.');
      await loadBatch();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao executar lote.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(itemId: string) {
    if (!id) return;
    setLoading(true);
    setFeedback(null);
    setError(null);

    try {
      await api.post(`/api/batches/${id}/retry-item`, { itemId });
      setFeedback('Item reprocessado manualmente.');
      await loadBatch();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao reprocessar item.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!id || !accessToken) return;

    const response = await fetch(`/api/batches/${id}/export`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      setError('Falha ao exportar CSV do lote.');
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lote-${id}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  if (!batch) {
    return <div className="text-sm text-slate-400">Carregando lote...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Arquivo" value={batch.file_name} hint="Origem do lote processado." />
        <MetricCard label="Status" value={batch.status} hint="Estado atual da execução." />
        <MetricCard label="Itens válidos" value={String(batch.total_valid_items)} hint="Linhas prontas para disparo de PIX." />
        <MetricCard label="Valor total" value={`R$ ${Number(batch.total_amount).toFixed(2)}`} hint="Somatório dos itens válidos do lote." />
      </div>

      <SectionCard
        title="Prévia e execução"
        subtitle="Revise a qualidade do lote, confirme a operação e acompanhe o retorno por item."
        action={
          batch.status === 'validated' ? (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading ? 'Executando...' : 'Confirmar e executar lote'}
            </button>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Sucesso</div>
            <div className="mt-3 text-2xl font-semibold text-white">{successCount}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Falha</div>
            <div className="mt-3 text-2xl font-semibold text-white">{failedCount}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Inválidos</div>
            <div className="mt-3 text-2xl font-semibold text-white">{invalidCount}</div>
          </div>
        </div>

        {feedback ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{feedback}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      </SectionCard>

      <SectionCard
        title="Itens do lote"
        subtitle="Erros por pagamento, retorno operacional e nova tentativa manual quando necessário."
        action={
          <button
            onClick={handleExport}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
          >
            Exportar CSV
          </button>
        }
      >
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Favorecido</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Erro</th>
                <th className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-200">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.payment_id}</td>
                  <td className="px-4 py-3">
                    <div>{item.recipient_name}</div>
                    <div className="text-xs text-slate-500">{item.pix_key}</div>
                  </td>
                  <td className="px-4 py-3">R$ {Number(item.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{item.error_message || '-'}</td>
                  <td className="px-4 py-3">
                    {item.status === 'failed' ? (
                      <button
                        onClick={() => handleRetry(item.id)}
                        className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200 transition hover:bg-cyan-400/20"
                      >
                        Tentar novamente
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Sem ação</span>
                    )}
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
