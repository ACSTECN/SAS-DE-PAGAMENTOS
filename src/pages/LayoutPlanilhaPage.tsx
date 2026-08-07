import { Download, FileSpreadsheet, Info, CheckCircle2 } from 'lucide-react';
import { SectionCard } from '@/components/SectionCard';

const sampleCsv = `payment_id,recipient_name,recipient_document,pix_key,amount,description
PAG-001,Ana Paula Souza,12345678909,ana.souza@email.com,150.50,Pagamento fornecedor semana 1
PAG-002,Joao Pereira Ltda,12345678000190,11999998888,2400.00,Repasse contrato comercial
PAG-003,Marcos Lima,98765432100,123e4567-e12b-12d1-a456-426614174000,89.90,Pagamento colaborador avulso
PAG-004,Carla Mendes,23456789012,c.mendes@empresa.io,3150.75,Adiantamento quinzenal
`;

function downloadSampleCsv() {
  const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'modelo-planilha-pix.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type ColumnSpec = {
  name: string;
  required: boolean;
  type: string;
  example: string;
  description: string;
};

const columns: ColumnSpec[] = [
  {
    name: 'payment_id',
    required: true,
    type: 'texto (único por lote)',
    example: 'PAG-001',
    description: 'Identificador interno do pagamento. Não pode repetir dentro do mesmo lote. Ex: REF-001, ORDEM-123.',
  },
  {
    name: 'recipient_name',
    required: true,
    type: 'texto',
    example: 'Ana Paula Souza',
    description: 'Nome completo da pessoa ou razão social da empresa que recebe o PIX.',
  },
  {
    name: 'recipient_document',
    required: true,
    type: '11 ou 14 dígitos (sem pontuação)',
    example: '12345678909',
    description: 'CPF (11 números) para pessoa física ou CNPJ (14 números) para PJ. Não use pontos, traços nem barras.',
  },
  {
    name: 'pix_key',
    required: true,
    type: 'chave PIX válida',
    example: 'ana@empresa.com.br',
    description: 'A chave PIX do recebedor. Aceita CPF, CNPJ, e-mail, telefone ou chave aleatória (EVP). Ex: 11999998888 ou 123e4567-e12b-12d1-a456-426614174000.',
  },
  {
    name: 'amount',
    required: true,
    type: 'decimal (ponto ou vírgula)',
    example: '2400.50',
    description: 'Valor em Reais (R$). Use ponto OU vírgula para centavos. O menor valor permitido é R$ 0,01.',
  },
  {
    name: 'description',
    required: false,
    type: 'texto (opcional)',
    example: 'Pagamento semana 1',
    description: 'Texto opcional que aparecerá no extrato Asaas e no detalhe do pagamento no SaaS.',
  },
];

export function LayoutPlanilhaPage() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Layout da planilha de repasse PIX"
          subtitle="Formato oficial que este SaaS espera para importar seus lotes de pagamento em qualquer empresa conectada ao Asaas."
        >
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5 text-sm text-slate-200">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-cyan-400/15 p-1.5 text-cyan-300"><Info size={16}/></div>
              <div>
                <div className="font-medium text-white">Funciona com Excel e com CSV</div>
                <p className="mt-1 leading-7 text-slate-400">
                  Monte a planilha no Excel, <span className="text-white">salve como</span> <code>.xlsx</code> <span className="text-white">ou</span> <code>.csv</code> e faça upload na tela <span className="text-cyan-300">Novo lote</span>.
                  A primeira linha sempre deve ser o cabeçalho (nome das colunas) exatamente como na tabela abaixo.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-3xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium">Coluna</th>
                  <th className="px-4 py-3 font-medium">Obrigatória</th>
                  <th className="px-4 py-3 font-medium">Formato</th>
                  <th className="px-4 py-3 font-medium">Exemplo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-200">
                {columns.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-cyan-300">{c.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{c.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      {c.required ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                          <CheckCircle2 size={12}/> Sim
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Opcional</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white">{c.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-8">
          <SectionCard
            title="Baixar modelo pronto"
            subtitle="Arquivo CSV com o cabeçalho correto e 4 linhas de exemplo — edite direto no Excel."
          >
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-300">
                    <FileSpreadsheet size={22}/>
                  </div>
                  <div>
                    <div className="text-white font-semibold">modelo-planilha-pix.csv</div>
                    <div className="text-xs text-slate-400">4 linhas de exemplo · 6 colunas</div>
                  </div>
                </div>
                <button
                  onClick={downloadSampleCsv}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  <Download size={16}/>
                  Baixar CSV modelo
                </button>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 text-sm text-slate-300 space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">Dica Asaas</div>
                <p className="leading-7 text-slate-400">
                  No Asaas, cada transferência PIX é individual. O SaaS envia uma por uma de forma segura (fila) usando a
                  conta Asaas conectada pela empresa. Você acompanha na tela do lote o progresso e o status de cada item.
                </p>
              </div>

              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/5 p-5 text-sm text-amber-100 space-y-2">
                <div className="font-medium text-amber-200">Antes de enviar o lote</div>
                <ul className="list-disc pl-5 space-y-1 text-amber-100/80">
                  <li>Confira se a chave PIX pertence realmente ao recebedor.</li>
                  <li>Confirme o valor e as casas decimais (vírgula ou ponto).</li>
                  <li>Certifique-se de haver saldo na conta Asaas conectada.</li>
                </ul>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
