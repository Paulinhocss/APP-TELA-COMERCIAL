# Fluxo comercial do Deak — evidências de 29 e 30/09/2026

> Fonte: logs fornecidos do usuário comercial MATHEUS (ERP VB e componente .NET). Este documento descreve fatos observados, não é uma especificação oficial do fornecedor. Nunca transportar dados de clientes ou credenciais para a interface.

## 1. Três fluxos independentes

1. **Criar orçamento**: localizar cliente, escolher produto/fabricante, conferir estoque, apresentação, impostos, preços e permissões; montar itens; conferir; `SalvaOrcamento`. Exemplo observado: orçamento 820424, 29/09 às 14h54. Deak registra `INSERT ORCAMENTO` + `INSERT ORCAMENTOITEM`, transação e estado `AB`.
2. **Alterar orçamento**: consultar orçamento existente, verificar `VerDireitosOrcamento`, `VerificaCredito`, carregar itens, editar/adicionar, recalcular, `UPDATE ORCAMENTOITEM` e salvar. Exemplo: orçamento 820424, 30/09.
3. **Gerar pedido**: `GeracaoPedido` confere crédito, pagamentos, estoque, lotes, margens, comissões, filial e regras; define filas de análise e executa alterações de estoque com `EstoqueHistorico`. Exemplo: orçamento 820498, 29/09 às 17h10. **Não equivale à emissão de nota fiscal**.

## 2. Regras e dependências observadas

| Assunto | Evidência no log | Regra para o aplicativo |
| --- | --- | --- |
| Acesso | usuário MATHEUS, filial 01, grupo TELEVNDS2, superior LIDIA; direitos consultados | Nunca inferir permissão somente pelo usuário informado no frontend. |
| Item e fabricante | `CodProduto_ID` combinado com `CodFabricante_ID` | Identificadores devem seguir juntos nos contratos. |
| Estoque | `EstoqueDeposito`, `EstoqueLocal`, `VNDS`, `EXPE`, físico e líquido por filial | Seleção de origem por **empresa + filial**; comparação com saldo líquido, sem gravar/reservar na consulta. |
| Apresentação | unidade de venda, quantidade mínima, múltiplos, fracionamento | Quantidade solicitada e quantidade comercial são campos diferentes. Para `ROLO_FIXO`, usar a unidade comercial de base. Conferir múltiplos. |
| Preço | `LPRECODEVENDAFINAL` com custo financeiro, custo, margem e LP1/LP2/LP3 | Motor S2.1 permanece hipótese parcial, não substituir a regra fiscal completa do Deak. |
| Tributação | `VerificaNOperItem` consulta classificação fiscal e pode alterar a natureza do item | CFOP/NOper e tributação são por item e dependem do cliente/UF. |
| Salvar | `SalvaOrcamento` faz transação SQL e grava itens, inclusive `Quantidade` distinta de `QtdeAprovada` | Nunca reinterpretar quantidades nem inventar colunas/valores no SQL real. |
| Pedido | `statusPedido` informa `AnaliseCredit`, `AnaliseMkp`, `AnalisePreco`, etc. | Análises são regras distintas; no caso 820498 foi registrada análise de crédito com margem de pedido 19,96 e mínima 13. |
| Estoque no pedido | `GravaEstoque` registrou `UPDATE EstoqueDeposito` no local `VNDS` e `INSERT EstoqueHistorico` | Gerar pedido não pode ser tratado como simples gravação de orçamento. |
| Positivação | logs analisados não demonstram a emissão da NFe para toda jornada | Venda positivada somente quando a emissão da nota for confirmada por fonte fiscal apropriada. |

## 3. Entrega React desta etapa

- Rota `/estrutura`: componentes `PainelCatalogo` e `PainelEstoque` são **somente leitura e seleção local**.
- Pesquisa de fabricante utiliza o endpoint já existente `GET /api/produtos/:produto/fornecedores?filial=XX`.
- A escolha do fabricante define a apresentação, mas nunca escolhe automaticamente a origem do estoque.
- Seleção por `Empresa:Filial` evita ambiguidade de filiais em empresas diferentes.
- Alterar produto ou filial comercial invalida seleções e leituras anteriores; não reutilizar preços de filial diferente.
- Os testes de regras locais cobrem rolo fixo, quantidade mínima, múltiplos e insuficiência de saldo.
- `/solicitacao` continua homologada e inalterada. Nenhum endpoint novo de escrita foi criado.

## 4. Fora do escopo desta entrega

Não foram migrados: motor fiscal completo, alçada efetiva e bloqueios, custo financeiro real, edição/gravação do orçamento, geração do pedido, movimentação, filas de aprovação, faturamento ou NFe. Estes fluxos exigem homologação específica e não devem ser inferidos do log isolado.

## 5. Testar no Windows

Na branch `estrutura/react-modular`:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test:catalogo
npm.cmd run dev
```

Abrir `http://localhost:5173/estrutura`. Testar alteração de produto, seleção de fabricante, escolha de filial e a preservação da quantidade original. Nenhuma venda real deve ser gerada.
