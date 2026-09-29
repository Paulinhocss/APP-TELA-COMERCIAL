APP TELA COMERCIAL — SPRINT 0 / ORÇAMENTO TESTE
================================================

OBJETIVO DESTA ENTREGA
- Node.js roda LOCALMENTE.
- Lê o orçamento real pelas views já criadas.
- NÃO faz INSERT/UPDATE/DELETE em dbo.Orcamento ou dbo.OrcamentoItem.
- Grava somente nas três tabelas TESTE criadas no banco aplicacoes.
- Permite comparar a cópia TESTE com o orçamento real do Deak.

VIEWS ESPERADAS
- dbo.Aplicativo_vw_Comercial_OrcamentoDeak
- dbo.Aplicativo_vw_Comercial_OrcamentoItemDeak
- dbo.Aplicativo_vw_Comercial_EstoqueTeste

TABELAS ESPERADAS
- dbo.Aplicativo_ComercialOrcamentoTeste
- dbo.Aplicativo_ComercialOrcamentoItemTeste
- dbo.Aplicativo_ComercialOrcamentoLogTeste

COMO RODAR
1. Copie .env.example e renomeie para .env.
2. Preencha DB_SERVER, DB_USER e DB_PASSWORD.
3. Confirme DB_NAME_APP=aplicacoes.
4. Dê dois cliques em iniciar.bat.
5. Abra http://localhost:3010

PRIMEIRO CASO DE HOMOLOGAÇÃO
Orçamento Deak: 809620
Esperado:
- 5 itens
- Total: R$ 1.787,73
- Margem: 13,83%
- ICMS: R$ 41,54
- PIS: R$ 11,62
- COFINS: R$ 53,62

FLUXO NA TELA
1. Buscar Deak
2. Copiar para TESTE
3. Comparar

Se o resultado mostrar HOMOLOGADO, concluímos que:
- Node local está acessando o SQL corretamente;
- as views estão corretas;
- as tabelas de teste aceitam a estrutura do orçamento;
- a transação de teste está consistente.

IMPORTANTE
Esta versão NÃO é o motor de cálculo do Deak ainda.
Ela cria a fundação segura para o próximo passo: montar um orçamento manualmente na tela e calcular/preencher seus campos sem copiar um orçamento existente.
