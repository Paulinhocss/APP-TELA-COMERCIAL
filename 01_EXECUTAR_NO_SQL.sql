USE aplicacoes;
GO

/*
  APP TELA COMERCIAL / Vanguard One
  S2.2A - ALÇADA COMERCIAL EM MODO DIAGNÓSTICO

  FONTES OFICIAIS LIDAS NO DEAK:
  - Usuario / UsuarioLimites: regras por usuário (ex.: Markup, Markup Min)
  - ProdutoFabrica.MargemMinima: margem mínima por produto + fabricante

  SEGURANÇA:
  - SOMENTE LEITURA do banco deak;
  - nenhuma alteração em ORCAMENTO / ORCAMENTOITEM;
  - esta etapa NÃO implementa bloqueio nem aprovação automática.
*/

CREATE OR ALTER VIEW dbo.Aplicativo_vw_Comercial_AlcadaUsuarioTeste
AS
SELECT
    U.Usuario,
    U.Pergrupo,
    U.UsuarioPai,
    U.Grupo,
    U.Funcao,
    U.ListaPrecoMinima,

    MarkupValorMax = MAX(CASE WHEN UPPER(LTRIM(RTRIM(UL.Politica))) = 'MARKUP' THEN UL.ValorMax END),
    MarkupFlgValor = MAX(CASE WHEN UPPER(LTRIM(RTRIM(UL.Politica))) = 'MARKUP' THEN UL.FlgValor END),

    MarkupMinValorMax = MAX(CASE WHEN UPPER(LTRIM(RTRIM(UL.Politica))) = 'MARKUP MIN' THEN UL.ValorMax END),
    MarkupMinFlgValor = MAX(CASE WHEN UPPER(LTRIM(RTRIM(UL.Politica))) = 'MARKUP MIN' THEN UL.FlgValor END)
FROM deak.dbo.Usuario U
LEFT JOIN deak.dbo.UsuarioLimites UL
  ON UL.Usuario = U.Usuario
 AND UL.Empresa = '01'
GROUP BY
    U.Usuario,
    U.Pergrupo,
    U.UsuarioPai,
    U.Grupo,
    U.Funcao,
    U.ListaPrecoMinima;
GO

CREATE OR ALTER VIEW dbo.Aplicativo_vw_Comercial_MargemMinimaProdutoTeste
AS
SELECT
    PF.CodProduto_ID,
    PF.CodFabricante_ID,
    MargemMinima = ISNULL(PF.MargemMinima, 0)
FROM deak.dbo.ProdutoFabrica PF;
GO

GRANT SELECT ON dbo.Aplicativo_vw_Comercial_AlcadaUsuarioTeste TO [crm_leitura];
GRANT SELECT ON dbo.Aplicativo_vw_Comercial_MargemMinimaProdutoTeste TO [crm_leitura];
GO

/* TESTE OURO - usuário Anderson */
SELECT *
FROM dbo.Aplicativo_vw_Comercial_AlcadaUsuarioTeste
WHERE Usuario = 'ANDERSON C';
GO

/* Produto 449 / COBRECOM: margem mínima esperada 10 */
SELECT *
FROM dbo.Aplicativo_vw_Comercial_MargemMinimaProdutoTeste
WHERE CodProduto_ID = 449
  AND CodFabricante_ID = '00025';
GO

/* Produto 20848 / 00144: margem mínima esperada 0 */
SELECT *
FROM dbo.Aplicativo_vw_Comercial_MargemMinimaProdutoTeste
WHERE CodProduto_ID = 20848
  AND CodFabricante_ID = '00144';
GO
