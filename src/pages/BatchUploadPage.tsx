import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/SectionCard';

export function BatchUploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError('Selecione uma planilha CSV ou XLSX.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.postForm<{ batchId: string }>('/api/batches', formData);
      navigate(`/app/lotes/${response.batchId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao criar lote.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionCard title="Novo lote de pagamentos" subtitle="Suba a planilha, gere a prévia e confirme a execução do lote.">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[32px] border border-dashed border-cyan-400/30 bg-cyan-400/5 p-8 text-center transition hover:border-cyan-300/60 hover:bg-cyan-400/10">
            <div className="rounded-3xl bg-slate-950/70 p-4 text-cyan-200">
              <Upload size={28} />
            </div>
            <div className="mt-6 text-2xl font-semibold text-white">
              {file ? file.name : 'Arraste ou selecione uma planilha'}
            </div>
            <div className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Colunas esperadas: <code>payment_id</code>, <code>recipient_name</code>, <code>recipient_document</code>, <code>pix_key</code>, <code>amount</code>, <code>description</code>.
            </div>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          <button
            disabled={loading}
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {loading ? 'Validando lote...' : 'Gerar prévia do lote'}
          </button>
        </form>

        {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      </SectionCard>
    </div>
  );
}
