# APP TELA COMERCIAL

Projeto isolado para homologacao da Tela Comercial.

## Stack atual

- React 18
- TypeScript
- Vite
- Express
- SQL Server via mssql

## Rodar localmente

1. Mantenha o arquivo .env somente no computador local.
2. Execute `npm.cmd install`.
3. Execute `npm.cmd run dev`.
4. Frontend: http://localhost:5173
5. API: http://localhost:3010
6. Tela comercial: http://localhost:5173/solicitacao

## Validacao

- `npm.cmd run typecheck`
- `npm.cmd run build`

## Producao/local compilado

Depois do build, `npm.cmd start` inicia a API e serve o frontend da pasta dist.

## Regra de seguranca da homologacao

A aplicacao continua sem gravar em deak.dbo.Orcamento e deak.dbo.OrcamentoItem.
As gravacoes permanecem somente nas estruturas TESTE previstas pelo projeto.

## Migracao

A interface agora entra por React + TypeScript + Vite.
A logica ja homologada foi preservada temporariamente em adaptadores TypeScript em src/legacy para evitar mudar regra comercial e stack no mesmo passo.
Novos sprints devem ser implementados em componentes, hooks e servicos TypeScript, reduzindo progressivamente o conteudo de src/legacy.
