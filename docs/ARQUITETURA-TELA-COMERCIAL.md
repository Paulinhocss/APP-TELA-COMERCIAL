# Arquitetura definitiva da Tela Comercial

## Diretrizes
- Projeto independente, React + TypeScript + Vite.
- Arquivos e pastas em português.
- Motor comercial e SQL somente no backend.
- Leitura de dados do Deak via views existentes.
- Sem INSERT, UPDATE ou DELETE em Orcamento/OrcamentoItem do Deak.
- Até homologação final, gravação somente em tabelas TESTE.
- Regras de preço, alçada, tributação e arredondamento não podem ser inventadas durante a migração.

## Jornada de oito módulos
1. Solicitação: captura de texto, pesquisa e entrada manual.
2. Produtos: catálogo, fabricante e apresentação.
3. Estoque: empresa, filial e saldo líquido.
4. Editor comercial: quantidade, LP1/LP2/LP3, preço, desconto, margem e alçada.
5. Grade: itens anexados, ordenação, edição, remoção e totais.
6. Cliente Deak: cadastro e informações comerciais.
7. Pagamento: condição, formas vinculadas, parcelas e custo financeiro.
8. Revisão: composição fiscal, auditoria e orçamento TESTE.

## Organização inicial
- src/modulos/comercial/tipos.ts: contratos TypeScript.
- src/modulos/comercial/api.ts: cliente HTTP.
- src/modulos/comercial/PaginaEstruturaComercial.tsx: estrutura e navegação React.
- src/modulos/comercial/estrutura.css: estilos próprios.

## Estado e rotas
- /solicitacao: tela atual homologada, preservada.
- /estrutura: nova página React nativa, inicialmente com análise real e vitrine de produtos consultados.
- /: comparação Deak x TESTE, preservada.

## Situação por módulo em 30/09/2026
- **Solicitação:** leitura real do Deak por API; análise estruturada em React.
- **Produtos:** seleção de produto e fabricante em componentes React controlados, com alerta de compatibilidade.
- **Estoque:** seleção manual da origem por empresa/filial, exibição de físico, VNDS, EXPE e líquido.
- **Apresentação:** quantidade solicitada preservada separadamente da comercial; para ROLO_FIXO, fator de conversão; mínimo e múltiplos no frontend (diagnóstico, ainda não substitui validação do ERP).
- **Editor comercial, grade, cliente, pagamento e revisão:** ainda não migrados da tela homologada.
- **Gravações:** nenhuma nova gravação foi habilitada nesta nova rota.

## Próximas entregas
A. Integrar motor S2.1 e alçadas S2.2A no Editor Comercial React sem presumir regras não homologadas.
B. Grade React com ordem estável, edição, remoção e arredondamento dos itens.
C. Cliente, pagamento e revisão fiscal.
D. Persistência somente no banco TESTE e homologação integral.
E. Geração de pedido como fluxo separado, dependente de análise e validação de impactos em estoque.

## Referência de processo
Consultar `docs/FLUXO-DEAK-LOGS-202609.md`. O fluxo do Deak distingue salvar orçamento, alterar orçamento e gerar pedido; a geração pode movimentar o estoque, portanto não será exposta nesta etapa.

A nova rota não escreve dados. Etapas ainda não migradas estão identificadas como estrutura prevista.
