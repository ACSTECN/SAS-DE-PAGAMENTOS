import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Batch } from '@/lib/types';
import { SectionCard } from '@/components/SectionCard';

export function HistoryPage() {
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    void api.get<{ batches: Batch[] }>('/api/batches').then((response) => setBatches(response.batches));
  }, []);

  return (
    <SectionCard title="Histórico de lotes" subtitle="Acompanhe uploads, pagamentos unitários e exporte os resultados básicos.">
      <div className="overflow-hidden rounded-3xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Arquivo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Itens</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-200">
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td className="px-4 py-3">{batch.origin}</td>
                <td className="px-4 py-3">{batch.file_name}</td>
                <td className="px-4 py-3">{batch.status}</td>
                <td className="px-4 py-3">{batch.total_items}</td>
                <td className="px-4 py-3">R$ {Number(batch.total_amount).toFixed(2)}</td>
                <td className="px-4 py-3">{new Date(batch.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <Link className="text-cyan-300 hover:text-cyan-200" to={`/app/lotes/${batch.id}`}>
                    Abrir detalhe
                  </Link>
                </td>
              </tr>
            ))}
            {!batches.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Ainda não existem lotes para esta empresa.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
