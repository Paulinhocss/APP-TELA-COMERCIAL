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

## Próximas entregas
A. Migração do catálogo e escolha do fabricante em componentes React.
B. Estoque, apresentação e editor comercial com tipos e estados controlados.
C. Grade com ordenação estável e cálculos homologados.
D. Cliente, pagamento e revisão fiscal.
E. Escrita em orçamento TESTE e homologação integral.

A nova rota não escreve dados. Etapas ainda não migradas estão identificadas como estrutura prevista.
