# Handoff

## Projeto
- SaaS multiempresa para automacao de pagamentos PIX.
- Frontend em React + Vite.
- Backend em Express + TypeScript.
- Banco e auth com Supabase.
- Integracao preparada para Banco Inter Empresas por tenant.

## Como rodar
- Copie `.env.example` para `.env`.
- Preencha as variaveis do Supabase e do app.
- Rode:

```bash
npm install
npm run dev
```

## Estrutura principal
- `src/`: frontend
- `api/`: backend
- `supabase/migrations/`: schema e migrations
- `.trae/documents/`: PRD e arquitetura

## Arquivos mais importantes
- `api/services/inter.ts`
- `api/routes/bankConnections.ts`
- `api/routes/batches.ts`
- `api/routes/payments.ts`
- `src/pages/BankConnectionPage.tsx`
- `src/pages/BatchUploadPage.tsx`
- `src/pages/BatchDetailPage.tsx`

## Status atual
- Multi-tenant basico implementado.
- Cadastro/login implementado.
- Conexao Banco Inter por empresa implementada.
- Pagamento unitario implementado.
- Upload de lote e execucao basica implementados.
- Historico e resultado basico implementados.

## Pendencias recomendadas
- Melhorar UX de onboarding do Banco Inter.
- Homologar payload real da API do Inter.
- Reforcar sessao/autenticacao para producao.
- Melhorar retries, auditoria e filtros de historico.

## Observacoes
- Nao subir `.env` no GitHub.
- Usar `.env.example` como referencia.
- Antes de producao, revisar seguranca de secrets e certificados.
