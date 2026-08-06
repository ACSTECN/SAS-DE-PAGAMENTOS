import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/SectionCard';

const initialForm = {
  paymentId: '',
  recipientName: '',
  recipientDocument: '',
  pixKey: '',
  amount: '',
  description: '',
};

type SinglePaymentResponse = {
  success: boolean;
  batchId: string;
  result?: {
    providerMessage?: string;
  };
};

export function PaymentPage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<SinglePaymentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.post<SinglePaymentResponse>('/api/payments/single', {
        ...form,
        amount: Number(form.amount),
      });
      setResult(response);
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao executar pagamento.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
      <SectionCard title="PIX unitário" subtitle="Envie um único pagamento manualmente com retorno imediato.">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {[
            ['paymentId', 'ID do pagamento'],
            ['recipientName', 'Nome do favorecido'],
            ['recipientDocument', 'Documento do favorecido'],
            ['pixKey', 'Chave PIX'],
            ['amount', 'Valor'],
            ['description', 'Descrição'],
          ].map(([field, label]) => (
            <label key={field} className="block">
              <span className="mb-2 block text-sm text-slate-300">{label}</span>
              <input
                type={field === 'amount' ? 'number' : 'text'}
                step={field === 'amount' ? '0.01' : undefined}
                value={form[field as keyof typeof form]}
                onChange={(event) =>
                  setForm((current) => ({
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
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {loading ? 'Processando...' : 'Executar PIX'}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Resultado da execução" subtitle="Use o histórico para acompanhar reprocessamentos e exportações.">
        {result ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-sm text-slate-400">Status</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {result.success ? 'Pagamento concluído' : 'Pagamento com falha'}
              </div>
              <div className="mt-3 text-sm text-slate-400">
                {result.result?.providerMessage || 'Retorno processado pela API.'}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-sm text-slate-400">Lote gerado automaticamente</div>
              <Link className="mt-3 inline-block text-cyan-300 hover:text-cyan-200" to={`/app/lotes/${result.batchId}`}>
                Abrir detalhe do pagamento
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-sm text-slate-400">
            Nenhum pagamento executado nesta sessão. Preencha o formulário ao lado para testar o fluxo manual.
          </div>
        )}

        {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      </SectionCard>
    </div>
  );
}
