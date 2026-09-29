require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = Number(process.env.PORT || 3010);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME_APP || 'aplicacoes',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 20000,
  requestTimeout: 60000,
};

let poolPromise = null;
async function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(dbConfig);
    pool.on('error', err => {
      console.error('[SQL] Erro na pool:', err.message);
      poolPromise = null;
    });
    poolPromise = pool.connect()
      .then(p => {
        console.log(`✅ SQL conectado: ${dbConfig.server} / ${dbConfig.database}`);
        return p;
      })
      .catch(err => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

function numeroValido(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const value = Number(v);
  return Number.isFinite(value) ? value : null;
}


// ===== S2.1 · Motor de preço em homologação =====
// Inferido e validado contra logs reais do Deak para cenários sem partilha:
// cargaBase = 1 - margemBase - (custoBase / precoBase)
// precoFinal = custoBase / (1 - margemAlvo - cargaBase - custoFinanceiro)
// custoApurado = precoFinal * (1 - margemAlvo)
//
// IMPORTANTE: isto ainda NÃO substitui toda a LPRECODEVENDAFINAL do Deak.
// NOper, tributação, fora do estado, partilha, ST, IPI, comissão, descontos e
// outros componentes serão homologados nos próximos passos.
function arred6(v) {
  return Number(Number(v || 0).toFixed(6));
}

function calcularMotorPrecoS21(base, custoFinanc = 0, margemAlvo = null) {
  if (!base) return { valido: false, motivo: 'Preço/custo base não localizado.' };
  const precoBase = Number(base.PrecoBaseConsulta || 0);
  const custoBase = Number(base.PrecoCusto || 0);
  const margemBase = Number(base.MargemBaseConsulta || 0);
  const margem = margemAlvo === null || margemAlvo === undefined || margemAlvo === ''
    ? margemBase
    : Number(margemAlvo);
  const financeiro = Number(custoFinanc || 0);

  if (!(precoBase > 0)) return { valido: false, motivo: 'Preço base da lista é zero.' };
  if (!(custoBase > 0)) return { valido: false, motivo: 'Custo base é zero.' };
  if (!Number.isFinite(margem) || margem < 0 || margem >= 100) return { valido: false, motivo: 'Margem inválida.' };

  const cargaBaseBruta = 1 - (margemBase / 100) - (custoBase / precoBase);
  // Nos casos ouro analisados do Deak, a carga estrutural converge para 9,38%.
  // Normalizamos a carga inferida para 2 casas percentuais antes do cálculo,
  // reproduzindo os resultados observados a 6 casas nos casos homologados.
  const cargaBasePercentual = Number((cargaBaseBruta * 100).toFixed(2));
  const cargaBaseDecimal = cargaBasePercentual / 100;
  const denominador = 1 - (margem / 100) - cargaBaseDecimal - (financeiro / 100);
  if (!(denominador > 0)) return { valido: false, motivo: 'Combinação de margem/cargas não permite calcular preço positivo.' };

  const precoVendaFinal = custoBase / denominador;
  const precoCustoApurado = precoVendaFinal * (1 - margem / 100);

  return {
    valido: true,
    lista: String(base.LPrecoConsulta || 'LP1').trim() || 'LP1',
    precoBase: arred6(precoBase),
    custoBase: arred6(custoBase),
    margemBase: arred6(margemBase),
    margemAlvo: arred6(margem),
    custoFinanc: arred6(financeiro),
    cargaBasePercentual: arred6(cargaBasePercentual),
    precoVendaFinal: arred6(precoVendaFinal),
    precoCustoApurado: arred6(precoCustoApurado),
    escopo: 'S2.1_SEM_PARTILHA',
  };
}



// ===== S2.2A · Alçada comercial em homologação =====
// O Deak mantém regras de usuário em UsuarioLimites (ex.: Markup / Markup Min)
// e margem mínima no vínculo ProdutoFabrica. Neste sprint a regra é exibida em
// modo DIAGNÓSTICO: não bloqueia o item e não grava análise no Deak.
async function buscarAlcadaUsuarioS22(pool, usuario) {
  const r = await pool.request()
    .input('usuario', sql.VarChar(50), String(usuario || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_AlcadaUsuarioTeste
      WHERE Usuario = @usuario
    `);
  return r.recordset[0] || null;
}

async function buscarMargemMinimaProdutoS22(pool, produto, fabricante) {
  const r = await pool.request()
    .input('produto', sql.Int, Number(produto))
    .input('fabricante', sql.VarChar(20), String(fabricante || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_MargemMinimaProdutoTeste
      WHERE CodProduto_ID = @produto
        AND CodFabricante_ID = @fabricante
    `);
  return r.recordset[0] || null;
}

async function buscarPrecoCustoBase(pool, filialOrcamento, produto, fabricante) {
  const r = await pool.request()
    .input('filial', sql.VarChar(2), String(filialOrcamento || '01').trim() || '01')
    .input('produto', sql.Int, Number(produto))
    .input('fabricante', sql.VarChar(20), String(fabricante || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_PrecoCustoBaseTeste
      WHERE FilialOrcamento = @filial
        AND CodProduto_ID = @produto
        AND CodFabricante_ID = @fabricante
    `);
  return r.recordset[0] || null;
}

async function buscarApresentacaoProduto(pool, produto, fabricante) {
  const r = await pool.request()
    .input('produto', sql.Int, Number(produto))
    .input('fabricante', sql.VarChar(20), String(fabricante || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_ApresentacaoProdutoTeste
      WHERE CodProduto_ID = @produto
        AND CodFabricante_ID = @fabricante
    `);
  return r.recordset[0] || null;
}

function quantidadeDeakPorApresentacao(apresentacao, quantidadeComercial) {
  const q = Number(quantidadeComercial || 0);
  if (!(q > 0)) return 0;
  // S2.1.3.3: a quantidade confirmada pelo vendedor já está na unidade base do Deak.
  // ROLO_FIXO: o frontend sugere ex. 8 un. x 100 = 800 MT, mas o vendedor confirma MT.
  // CARRETEL_CORTE / BOBINA_CORTE / METRO: metragem direta.
  // BLISTER_UNIDADE / UNIDADE: quantidade direta na unidade cadastrada (ex.: PC).
  return arred6(q);
}

function quantidadeRespeitaMultiplo(qtd, multiplo, tolerancia = 0.000001) {
  const q = Number(qtd || 0);
  const m = Number(multiplo || 0);
  if (!(q > 0) || !(m > 0)) return false;
  const razao = q / m;
  return Math.abs(razao - Math.round(razao)) <= tolerancia;
}

function igualNumero(a, b, tolerancia = 0.005) {
  if (a === null || a === undefined || b === null || b === undefined) return a == b;
  return Math.abs(Number(a) - Number(b)) <= tolerancia;
}

function linhaComparacao(campo, deak, teste, tolerancia = 0.005) {
  return {
    campo,
    deak,
    teste,
    ok: typeof deak === 'number' || typeof teste === 'number'
      ? igualNumero(deak, teste, tolerancia)
      : String(deak ?? '') === String(teste ?? ''),
  };
}

async function buscarDeak(numero, executor = null) {
  const pool = executor || await getPool();

  const cab = await pool.request()
    .input('numero', sql.Int, numero)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_OrcamentoDeak
      WHERE CodOrcamento_ID = @numero
    `);

  if (!cab.recordset.length) return null;

  const itens = await pool.request()
    .input('numero', sql.Int, numero)
    .query(`
      SELECT *
      FROM dbo.Aplicativo_vw_Comercial_OrcamentoItemDeak
      WHERE CodOrcamento_ID = @numero
      ORDER BY NItem
    `);

  return { orcamento: cab.recordset[0], itens: itens.recordset };
}

async function buscarTeste(numero, executor = null) {
  const pool = executor || await getPool();

  const cab = await pool.request()
    .input('numero', sql.Int, numero)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_ComercialOrcamentoTeste
      WHERE NumeroTeste = @numero
      ORDER BY Id DESC
    `);

  if (!cab.recordset.length) return null;
  const orcamento = cab.recordset[0];

  const itens = await pool.request()
    .input('orcamentoId', sql.Int, orcamento.Id)
    .query(`
      SELECT *
      FROM dbo.Aplicativo_ComercialOrcamentoItemTeste
      WHERE OrcamentoTeste_ID = @orcamentoId
      ORDER BY NItem
    `);

  return { orcamento, itens: itens.recordset };
}

async function excluirTestePorNumero(numero, transaction) {
  const found = await transaction.request()
    .input('numero', sql.Int, numero)
    .query(`
      SELECT Id
      FROM dbo.Aplicativo_ComercialOrcamentoTeste
      WHERE NumeroTeste = @numero
    `);

  for (const row of found.recordset) {
    await transaction.request()
      .input('id', sql.Int, row.Id)
      .query(`DELETE FROM dbo.Aplicativo_ComercialOrcamentoItemTeste WHERE OrcamentoTeste_ID = @id`);

    await transaction.request()
      .input('id', sql.Int, row.Id)
      .query(`DELETE FROM dbo.Aplicativo_ComercialOrcamentoLogTeste WHERE OrcamentoTeste_ID = @id`);
  }

  await transaction.request()
    .input('numero', sql.Int, numero)
    .query(`DELETE FROM dbo.Aplicativo_ComercialOrcamentoTeste WHERE NumeroTeste = @numero`);
}

async function importarDeakParaTeste(numero, substituir = false) {
  const pool = await getPool();
  const deak = await buscarDeak(numero, pool);
  if (!deak) {
    const err = new Error('Orçamento não encontrado na view do Deak.');
    err.status = 404;
    throw err;
  }

  const existing = await buscarTeste(numero, pool);
  if (existing && !substituir) {
    const err = new Error('Este orçamento já foi importado para TESTE. Use substituir=1 para recriar.');
    err.status = 409;
    throw err;
  }

  const t = new sql.Transaction(pool);
  await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    if (existing && substituir) await excluirTestePorNumero(numero, t);

    const o = deak.orcamento;
    const ins = await t.request()
      .input('NumeroTeste', sql.Int, numero)
      .input('Empresa', sql.VarChar(2), '01')
      .input('Filial', sql.VarChar(2), String(o.Filial || '01'))
      .input('CGC', sql.VarChar(20), String(o.CGC || ''))
      .input('CodVendedor_ID', sql.VarChar(50), o.CodVendedor_ID || null)
      .input('VendedorExt', sql.VarChar(50), o.VendedorExt || null)
      .input('CondPagto_ID', sql.VarChar(20), o.CondPagto_ID || null)
      .input('NOper', sql.VarChar(20), o.NOper || null)
      .input('CodTributo', sql.VarChar(20), o.CodTributo || null)
      .input('Prioridade', sql.VarChar(10), o.Prioridade || null)
      .input('OrdemCompra', sql.VarChar(100), o.OrdemCompra || null)
      .input('Margem', sql.Decimal(18, 6), n(o.Margem))
      .input('VlrProdutos', sql.Decimal(18, 2), n(o.VlrProdutos) || 0)
      .input('VlrICMS', sql.Decimal(18, 2), n(o.VlrICMS) || 0)
      .input('VlrPIS', sql.Decimal(18, 2), n(o.VlrPIS) || 0)
      .input('VlrCOFINS', sql.Decimal(18, 2), n(o.VlrCOFINS) || 0)
      .input('VlrIPI', sql.Decimal(18, 2), n(o.VlrIPI) || 0)
      .input('VlrST', sql.Decimal(18, 2), n(o.VlrST) || 0)
      .input('VlrFrete', sql.Decimal(18, 2), n(o.VlrFrete) || 0)
      .input('VlrTotal', sql.Decimal(18, 2), n(o.VlrTotal) || 0)
      .input('Observacoes', sql.VarChar(sql.MAX), o.Observacoes || null)
      .input('Status', sql.VarChar(20), 'IMPORTADO_DEAK')
      .input('UsuarioCriacao', sql.VarChar(50), 'TESTE_LOCAL')
      .query(`
        INSERT INTO dbo.Aplicativo_ComercialOrcamentoTeste
        (
          NumeroTeste, Empresa, Filial, CGC,
          CodVendedor_ID, VendedorExt, CondPagto_ID,
          NOper, CodTributo, Prioridade, OrdemCompra,
          Margem, VlrProdutos, VlrICMS, VlrPIS, VlrCOFINS,
          VlrIPI, VlrST, VlrFrete, VlrTotal,
          Observacoes, Status, UsuarioCriacao
        )
        OUTPUT INSERTED.Id
        VALUES
        (
          @NumeroTeste, @Empresa, @Filial, @CGC,
          @CodVendedor_ID, @VendedorExt, @CondPagto_ID,
          @NOper, @CodTributo, @Prioridade, @OrdemCompra,
          @Margem, @VlrProdutos, @VlrICMS, @VlrPIS, @VlrCOFINS,
          @VlrIPI, @VlrST, @VlrFrete, @VlrTotal,
          @Observacoes, @Status, @UsuarioCriacao
        )
      `);

    const orcamentoTesteId = ins.recordset[0].Id;

    for (const item of deak.itens) {
      const quantidade = n(item.Quantidade) || 0;
      const precoDesconto = n(item.PrecoDesconto);
      const precoNegociado = quantidade && precoDesconto !== null
        ? Number((precoDesconto / quantidade).toFixed(6))
        : null;

      await t.request()
        .input('OrcamentoTeste_ID', sql.Int, orcamentoTesteId)
        .input('NItem', sql.Int, Number(item.NItem))
        .input('CodProduto_ID', sql.Int, Number(item.CodProduto_ID))
        .input('CodFabricante_ID', sql.VarChar(20), String(item.CodFabricante_ID || ''))
        .input('DescricaoProduto', sql.VarChar(500), item.DescricaoProduto || null)
        .input('NomeFabricante', sql.VarChar(200), item.NomeFabricante || null)
        .input('RefFabricante', sql.VarChar(150), item.RefFabricante == null ? null : String(item.RefFabricante))
        .input('UnidadeMedida_ID', sql.VarChar(10), item.UnidadeMedida_ID || null)
        .input('Quantidade', sql.Decimal(18, 3), quantidade)
        .input('PrecoLista', sql.Decimal(18, 6), n(item.PrecoUnitario))
        .input('PrecoUnitario', sql.Decimal(18, 6), n(item.PrecoUnitario))
        .input('PrecoNegociado', sql.Decimal(18, 6), precoNegociado)
        .input('PrecoTotal', sql.Decimal(18, 2), n(item.PrecoTotal))
        .input('PrecoDesconto', sql.Decimal(18, 2), precoDesconto)
        .input('PorcDesconto', sql.Decimal(18, 6), n(item.PorcDesconto))
        .input('PrecoCustoOri', sql.Decimal(18, 6), n(item.PrecoCustoOri))
        .input('PrecoCusto', sql.Decimal(18, 6), n(item.PrecoCusto))
        .input('Margem', sql.Decimal(18, 6), n(item.Margem))
        .input('NOper', sql.VarChar(20), item.NOper || null)
        .input('CodTributo', sql.VarChar(20), item.CodTributo || null)
        .input('ICMS', sql.Decimal(18, 6), n(item.ICMS))
        .input('IPI', sql.Decimal(18, 6), n(item.IPI))
        .input('VlrBaseICMS', sql.Decimal(18, 2), n(item.VlrBaseICMS))
        .input('VlrICMS', sql.Decimal(18, 2), n(item.VlrICMS))
        .input('VlrPIS', sql.Decimal(18, 2), n(item.VlrPIS))
        .input('VlrCOFINS', sql.Decimal(18, 2), n(item.VlrCOFINS))
        .input('VlrIPI', sql.Decimal(18, 2), n(item.VlrIPI))
        .input('VlrST', sql.Decimal(18, 2), n(item.VlrBaseST))
        .input('Observacao', sql.VarChar(sql.MAX), item.Observacao || null)
        .query(`
          INSERT INTO dbo.Aplicativo_ComercialOrcamentoItemTeste
          (
            OrcamentoTeste_ID, NItem, CodProduto_ID, CodFabricante_ID,
            DescricaoProduto, NomeFabricante, RefFabricante,
            UnidadeMedida_ID, Quantidade,
            PrecoLista, PrecoUnitario, PrecoNegociado,
            PrecoTotal, PrecoDesconto, PorcDesconto,
            PrecoCustoOri, PrecoCusto, Margem,
            NOper, CodTributo, ICMS, IPI,
            VlrBaseICMS, VlrICMS, VlrPIS, VlrCOFINS, VlrIPI, VlrST,
            Observacao
          )
          VALUES
          (
            @OrcamentoTeste_ID, @NItem, @CodProduto_ID, @CodFabricante_ID,
            @DescricaoProduto, @NomeFabricante, @RefFabricante,
            @UnidadeMedida_ID, @Quantidade,
            @PrecoLista, @PrecoUnitario, @PrecoNegociado,
            @PrecoTotal, @PrecoDesconto, @PorcDesconto,
            @PrecoCustoOri, @PrecoCusto, @Margem,
            @NOper, @CodTributo, @ICMS, @IPI,
            @VlrBaseICMS, @VlrICMS, @VlrPIS, @VlrCOFINS, @VlrIPI, @VlrST,
            @Observacao
          )
        `);
    }

    await t.request()
      .input('OrcamentoTeste_ID', sql.Int, orcamentoTesteId)
      .input('Acao', sql.VarChar(50), 'IMPORTAR_DEAK_TESTE')
      .input('Usuario', sql.VarChar(50), 'TESTE_LOCAL')
      .input('Descricao', sql.VarChar(sql.MAX), `Orçamento Deak ${numero} copiado para ambiente de teste.`)
      .input('DadosJson', sql.VarChar(sql.MAX), JSON.stringify({ numeroDeak: numero, itens: deak.itens.length }))
      .query(`
        INSERT INTO dbo.Aplicativo_ComercialOrcamentoLogTeste
          (OrcamentoTeste_ID, Acao, Usuario, Descricao, DadosJson)
        VALUES
          (@OrcamentoTeste_ID, @Acao, @Usuario, @Descricao, @DadosJson)
      `);

    await t.commit();
    return await buscarTeste(numero, pool);
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    throw err;
  }
}

function comparar(deak, teste) {
  if (!deak || !teste) return null;

  const resumo = [
    linhaComparacao('Itens', deak.itens.length, teste.itens.length, 0),
    linhaComparacao('VlrTotal', n(deak.orcamento.VlrTotal), n(teste.orcamento.VlrTotal), 0.01),
    linhaComparacao('Margem', n(deak.orcamento.Margem), n(teste.orcamento.Margem), 0.001),
    linhaComparacao('VlrICMS', n(deak.orcamento.VlrICMS), n(teste.orcamento.VlrICMS), 0.01),
    linhaComparacao('VlrPIS', n(deak.orcamento.VlrPIS), n(teste.orcamento.VlrPIS), 0.01),
    linhaComparacao('VlrCOFINS', n(deak.orcamento.VlrCOFINS), n(teste.orcamento.VlrCOFINS), 0.01),
    linhaComparacao('NOper', deak.orcamento.NOper, teste.orcamento.NOper),
    linhaComparacao('CodTributo', deak.orcamento.CodTributo, teste.orcamento.CodTributo),
  ];

  const testePorItem = new Map(teste.itens.map(i => [Number(i.NItem), i]));
  const itens = deak.itens.map(d => {
    const t = testePorItem.get(Number(d.NItem));
    if (!t) return { NItem: d.NItem, produto: d.CodProduto_ID, fabricante: d.CodFabricante_ID, ok: false, motivo: 'Item ausente no TESTE' };

    const checks = [
      linhaComparacao('CodProduto_ID', Number(d.CodProduto_ID), Number(t.CodProduto_ID), 0),
      linhaComparacao('CodFabricante_ID', String(d.CodFabricante_ID), String(t.CodFabricante_ID)),
      linhaComparacao('DescricaoProduto', d.DescricaoProduto, t.DescricaoProduto),
      linhaComparacao('NomeFabricante', d.NomeFabricante, t.NomeFabricante),
      linhaComparacao('RefFabricante', String(d.RefFabricante ?? ''), String(t.RefFabricante ?? '')),
      linhaComparacao('Quantidade', n(d.Quantidade), n(t.Quantidade), 0.001),
      linhaComparacao('PrecoUnitario', n(d.PrecoUnitario), n(t.PrecoUnitario), 0.000001),
      linhaComparacao('PrecoTotal', n(d.PrecoTotal), n(t.PrecoTotal), 0.01),
      linhaComparacao('PrecoDesconto', n(d.PrecoDesconto), n(t.PrecoDesconto), 0.01),
      linhaComparacao('Margem', n(d.Margem), n(t.Margem), 0.001),
      linhaComparacao('NOper', d.NOper, t.NOper),
      linhaComparacao('CodTributo', d.CodTributo, t.CodTributo),
      linhaComparacao('VlrICMS', n(d.VlrICMS), n(t.VlrICMS), 0.01),
      linhaComparacao('VlrPIS', n(d.VlrPIS), n(t.VlrPIS), 0.01),
      linhaComparacao('VlrCOFINS', n(d.VlrCOFINS), n(t.VlrCOFINS), 0.01),
    ];

    return {
      NItem: d.NItem,
      produto: d.CodProduto_ID,
      fabricante: d.CodFabricante_ID,
      ok: checks.every(c => c.ok),
      checks,
    };
  });

  return {
    ok: resumo.every(c => c.ok) && itens.every(i => i.ok),
    resumo,
    itens,
  };
}

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT DB_NAME() AS banco, GETDATE() AS agora`);
    res.json({ ok: true, sql: r.recordset[0] });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

app.get('/api/deak/:numero', async (req, res, next) => {
  try {
    const numero = numeroValido(req.params.numero);
    if (!numero) return res.status(400).json({ erro: 'Número inválido.' });
    const data = await buscarDeak(numero);
    if (!data) return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    res.json(data);
  } catch (err) { next(err); }
});

app.get('/api/estoque/:produto/:fabricante', async (req, res, next) => {
  try {
    const produto = Number(req.params.produto);
    if (!Number.isInteger(produto) || produto <= 0) return res.status(400).json({ erro: 'Produto inválido.' });
    const fabricante = String(req.params.fabricante || '').trim();
    const pool = await getPool();
    const r = await pool.request()
      .input('produto', sql.Int, produto)
      .input('fabricante', sql.VarChar(20), fabricante)
      .query(`
        SELECT *
        FROM dbo.Aplicativo_vw_Comercial_EstoqueTeste
        WHERE CodProduto_ID = @produto
          AND CodFabricante_ID = @fabricante
        ORDER BY Empresa, Filial
      `);
    res.json(r.recordset);
  } catch (err) { next(err); }
});

app.get('/api/teste/:numero', async (req, res, next) => {
  try {
    const numero = numeroValido(req.params.numero);
    if (!numero) return res.status(400).json({ erro: 'Número inválido.' });
    const data = await buscarTeste(numero);
    if (!data) return res.status(404).json({ erro: 'Orçamento não existe no ambiente TESTE.' });
    res.json(data);
  } catch (err) { next(err); }
});

app.post('/api/teste/importar/:numero', async (req, res, next) => {
  try {
    const numero = numeroValido(req.params.numero);
    if (!numero) return res.status(400).json({ erro: 'Número inválido.' });
    const substituir = String(req.query.substituir || '') === '1';
    const data = await importarDeakParaTeste(numero, substituir);
    res.status(201).json({ ok: true, mensagem: 'Orçamento copiado para TESTE.', ...data });
  } catch (err) { next(err); }
});

app.get('/api/comparar/:numero', async (req, res, next) => {
  try {
    const numero = numeroValido(req.params.numero);
    if (!numero) return res.status(400).json({ erro: 'Número inválido.' });
    const pool = await getPool();
    const [deak, teste] = await Promise.all([buscarDeak(numero, pool), buscarTeste(numero, pool)]);
    if (!deak) return res.status(404).json({ erro: 'Orçamento não encontrado no Deak.' });
    if (!teste) return res.status(404).json({ erro: 'Orçamento ainda não foi importado para TESTE.' });
    res.json(comparar(deak, teste));
  } catch (err) { next(err); }
});

app.delete('/api/teste/:numero', async (req, res, next) => {
  try {
    const numero = numeroValido(req.params.numero);
    if (!numero) return res.status(400).json({ erro: 'Número inválido.' });
    const pool = await getPool();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      await excluirTestePorNumero(numero, t);
      await t.commit();
      res.json({ ok: true, mensagem: `Teste ${numero} removido.` });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (err) { next(err); }
});


// ===== S1 · Solicitação do cliente / produtos / fornecedores =====
function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function normalizaDescricao(texto) {
  return semAcento(texto)
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

const COR_ALIASES = {
  BRANCO: ['BRANCO', 'BCO', 'BC', 'BR'],
  PRETO: ['PRETO', 'PTO', 'PT'],
  VERMELHO: ['VERMELHO', 'VERM', 'VM'],
  AMARELO: ['AMARELO', 'AMAR', 'AM'],
  AZUL: ['AZUL', 'AZ'],
  VERDE: ['VERDE', 'VD'],
  CINZA: ['CINZA', 'CZ'],
  MARROM: ['MARROM', 'MR'],
  LARANJA: ['LARANJA', 'LJ'],
};

const TODAS_CORES = Object.entries(COR_ALIASES);

function coresEncontradas(descricao) {
  const tokens = new Set(tokeniza(descricao));
  return TODAS_CORES
    .filter(([, aliases]) => aliases.some(a => tokens.has(a)))
    .map(([cor]) => cor);
}

function compatibilidadeCor(descricao, corSolicitada) {
  const solicitada = semAcento(corSolicitada);
  const encontrouSolicitada = temCor(descricao, solicitada);
  const encontradas = coresEncontradas(descricao);
  const temOutraCor = encontradas.some(c => c !== solicitada);
  return {
    encontrouSolicitada,
    temOutraCor,
    coresEncontradas: encontradas,
    compativel: encontrouSolicitada && !temOutraCor,
  };
}

function tokeniza(texto) {
  return normalizaDescricao(texto)
    .replace(/[^A-Z0-9.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function temCor(descricao, cor) {
  const aliases = COR_ALIASES[semAcento(cor)] || [semAcento(cor)];
  const tokens = new Set(tokeniza(descricao));
  return aliases.some(a => tokens.has(a));
}

function temCategoria(descricao, categoria) {
  const d = normalizaDescricao(descricao);
  const c = semAcento(categoria);
  if (c.startsWith('FIO') || c.startsWith('CABO')) {
    return d.includes('FIO') || d.includes('CABO');
  }
  return c ? d.includes(c) : false;
}

function temBitola(descricao, bitola) {
  if (bitola === null || bitola === undefined || bitola === '') return false;
  const solicitada = Number(String(bitola).replace(',', '.'));
  if (!Number.isFinite(solicitada)) return false;

  // Importante: não usamos includes("6MM"), porque isso também casa com "16MM".
  // Extraímos as bitolas completas que antecedem MM/MM2 e comparamos numericamente.
  const d = normalizaDescricao(descricao);
  const encontrados = [...d.matchAll(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s*MM(?:2|²)?(?=$|[^0-9])/g)]
    .map(m => Number(m[1]))
    .filter(Number.isFinite);

  return encontrados.some(v => Math.abs(v - solicitada) < 0.0001);
}

function scoreProduto(item, row) {
  let score = 0;
  const bitolaCompativel = temBitola(row.DescricaoProduto, item.bitola);
  const corInfo = compatibilidadeCor(row.DescricaoProduto, item.cor);
  const categoriaCompativel = temCategoria(row.DescricaoProduto, item.categoria);

  if (bitolaCompativel) score += 60;
  if (corInfo.compativel) score += 30;
  else if (corInfo.encontrouSolicitada) score += 15;
  else if (corInfo.temOutraCor) score -= 80;
  if (categoriaCompativel) score += 10;

  return {
    score,
    bitolaCompativel,
    corCompativel: corInfo.compativel,
    categoriaCompativel,
    coresEncontradas: corInfo.coresEncontradas,
    elegivelAuto: bitolaCompativel && corInfo.compativel && categoriaCompativel,
  };
}

function interpretarSolicitacao(texto) {
  const linhas = String(texto || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const itens = [];
  let categoria = '';
  let bitola = null;
  let emTotal = false;
  let pendente = null;

  const numero = valor => Number(String(valor || '').replace(',', '.'));

  const adicionar = ({ bitolaItem, cor, quantidade, original }) => {
    const b = numero(bitolaItem);
    const q = numero(quantidade);
    if (!Number.isFinite(b) || !Number.isFinite(q) || q <= 0 || !String(cor || '').trim()) return false;

    itens.push({
      id: itens.length + 1,
      categoria: categoria || 'Produto',
      bitola: b,
      cor: String(cor).trim(),
      quantidade: q,
      textoOriginal: original,
    });
    return true;
  };

  for (const original of linhas) {
    const limpa = original
      .replace(/^[-*•✓]+\s*/, '')
      .replace(/\*+/g, '')
      .trim();

    if (!limpa) continue;
    const up = semAcento(limpa);

    if (/^TOTAL\b/.test(up)) {
      emTotal = true;
      pendente = null;
      continue;
    }
    if (emTotal) continue;

    // Formato clássico: linha contendo somente a bitola, ex.: "2,5 mm".
    const bitolaMatch = limpa.match(/^(\d+(?:[.,]\d+)?)\s*(?:mm(?:²|2)?)?\s*$/i);
    if (bitolaMatch) {
      bitola = numero(bitolaMatch[1]);
      pendente = null;
      continue;
    }

    // Formato clássico: "Branco — 8 un." após uma linha de bitola.
    const itemMatch = limpa.match(/^(.+?)\s*(?:—|–|-|:)\s*(\d+(?:[.,]\d+)?)\s*(?:un\.?|und\.?|unidades?)?\s*\.?$/i);
    if (itemMatch && bitola !== null && !/^SOLICITADO\b/i.test(limpa)) {
      if (adicionar({ bitolaItem: bitola, cor: itemMatch[1], quantidade: itemMatch[2], original })) {
        pendente = null;
        continue;
      }
    }

    // Formato em uma linha: "2,5 mm Branco — 8 un.".
    const combinado = limpa.match(/^(\d+(?:[.,]\d+)?)\s*mm(?:²|2)?\s+(.+?)\s*(?:—|–|-|:)\s*(\d+(?:[.,]\d+)?)\s*(?:un\.?|und\.?|unidades?)?\s*\.?$/i);
    if (combinado) {
      bitola = numero(combinado[1]);
      if (adicionar({ bitolaItem: bitola, cor: combinado[2], quantidade: combinado[3], original })) {
        pendente = null;
        continue;
      }
    }

    // Também aceita: "2,5 mm Branco 8 un." (sem travessão/dois-pontos).
    const combinadoLivre = limpa.match(/^(\d+(?:[.,]\d+)?)\s*mm(?:²|2)?\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:un\.?|und\.?|unidades?)\s*\.?$/i);
    if (combinadoLivre) {
      bitola = numero(combinadoLivre[1]);
      if (adicionar({ bitolaItem: bitola, cor: combinadoLivre[2], quantidade: combinadoLivre[3], original })) {
        pendente = null;
        continue;
      }
    }

    // Formato de conferência/teste em duas linhas:
    // "2,5 mm Branco" + "Solicitado: 8 un.".
    const descricaoPendente = limpa.match(/^(\d+(?:[.,]\d+)?)\s*mm(?:²|2)?\s+(.+?)\s*$/i);
    if (descricaoPendente && !/\b(?:ROLO|BOBINA|BLISTER)\b/i.test(limpa)) {
      bitola = numero(descricaoPendente[1]);
      pendente = {
        bitola,
        cor: descricaoPendente[2].trim(),
        original,
      };
      continue;
    }

    const solicitado = limpa.match(/^SOLICITADO\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:un\.?|und\.?|unidades?|m|mt|metros?)?\s*\.?$/i);
    if (solicitado && pendente) {
      adicionar({
        bitolaItem: pendente.bitola,
        cor: pendente.cor,
        quantidade: solicitado[1],
        original: `${pendente.original} | ${original}`,
      });
      pendente = null;
      continue;
    }

    // Linhas de contexto de uma conferência não viram cabeçalho nem item.
    if (/^(?:PRODUTO|ROLO|BOBINA|BLISTER|FABRICANTE|FORNECEDOR)\b/i.test(limpa)) {
      continue;
    }

    // Linha textual sem quantidade: tratamos como categoria/cabeçalho.
    if (!/\d/.test(limpa) && limpa.length <= 60) {
      categoria = limpa.replace(/:$/, '').trim();
    }
  }

  return {
    itens,
    resumo: {
      linhasIdentificadas: itens.length,
      quantidadeTotal: itens.reduce((s, i) => s + Number(i.quantidade || 0), 0),
    },
  };
}

function padroesBitola(bitola) {
  const b = Number(bitola);
  if (!Number.isFinite(b)) return [];
  const texto = String(b).replace('.', ',');
  if (Number.isInteger(b)) {
    return [`%${b}MM%`, `%${b},0MM%`, `%${b},00MM%`];
  }
  return [`%${texto}MM%`, `%${texto}0MM%`];
}

async function buscarCandidatosProduto(item, pool, filialOrcamento = '01') {
  const patterns = padroesBitola(item.bitola);
  const req = pool.request();
  req.input('filialOrcamento', sql.VarChar(2), String(filialOrcamento || '01').trim() || '01');
  const filtros = [];
  patterns.forEach((p, idx) => {
    req.input(`b${idx}`, sql.VarChar(40), p);
    filtros.push(`REPLACE(REPLACE(UPPER(c.DescricaoProduto), '.', ','), ' ', '') LIKE REPLACE(@b${idx}, ' ', '')`);
  });

  let where = filtros.length ? `WHERE (${filtros.join(' OR ')})` : '';
  let r = await req.query(`
    SELECT TOP 300
      c.CodProduto_ID,
      c.CodFabricante_ID,
      c.DescricaoProduto,
      c.NomeFabricante,
      c.RefFabricante,
      p.LPrecoConsulta,
      p.PrecoBaseConsulta,
      p.MargemBaseConsulta,
      a.UnidadeMedida,
      a.UnidadeMedidaVnds,
      a.QtdeUnidade,
      a.QtMinVenda,
      a.QtMinVenda_Multiplo,
      a.TipoApresentacao,
      a.FatorConversaoVenda,
      a.MultiploVenda
    FROM dbo.Aplicativo_vw_Comercial_CatalogoProdutoFornecedorTeste c
    LEFT JOIN dbo.Aplicativo_vw_Comercial_PrecoCustoBaseTeste p
      ON p.FilialOrcamento = @filialOrcamento
     AND p.CodProduto_ID = c.CodProduto_ID
     AND p.CodFabricante_ID = c.CodFabricante_ID
    LEFT JOIN dbo.Aplicativo_vw_Comercial_ApresentacaoProdutoTeste a
      ON a.CodProduto_ID = c.CodProduto_ID
     AND a.CodFabricante_ID = c.CodFabricante_ID
    ${where}
    ORDER BY c.CodProduto_ID, c.CodFabricante_ID
  `);

  // Fallback para solicitações fora do padrão de bitola.
  if (!r.recordset.length) {
    const termo = semAcento(item.cor || item.categoria).slice(0, 30);
    r = await pool.request()
      .input('termo', sql.VarChar(40), `%${termo}%`)
      .input('filialOrcamento', sql.VarChar(2), String(filialOrcamento || '01').trim() || '01')
      .query(`
        SELECT TOP 200
          c.CodProduto_ID,
          c.CodFabricante_ID,
          c.DescricaoProduto,
          c.NomeFabricante,
          c.RefFabricante,
          p.LPrecoConsulta,
          p.PrecoBaseConsulta,
          p.MargemBaseConsulta,
          a.UnidadeMedida,
          a.UnidadeMedidaVnds,
          a.QtdeUnidade,
          a.QtMinVenda,
          a.QtMinVenda_Multiplo,
          a.TipoApresentacao,
          a.FatorConversaoVenda,
          a.MultiploVenda
        FROM dbo.Aplicativo_vw_Comercial_CatalogoProdutoFornecedorTeste c
        LEFT JOIN dbo.Aplicativo_vw_Comercial_PrecoCustoBaseTeste p
          ON p.FilialOrcamento = @filialOrcamento
         AND p.CodProduto_ID = c.CodProduto_ID
         AND p.CodFabricante_ID = c.CodFabricante_ID
        LEFT JOIN dbo.Aplicativo_vw_Comercial_ApresentacaoProdutoTeste a
          ON a.CodProduto_ID = c.CodProduto_ID
         AND a.CodFabricante_ID = c.CodFabricante_ID
        WHERE UPPER(c.DescricaoProduto) LIKE @termo
           OR UPPER(c.NomeFabricante) LIKE @termo
        ORDER BY c.CodProduto_ID, c.CodFabricante_ID
      `);
  }

  const grupos = new Map();
  for (const row of r.recordset) {
    const cod = Number(row.CodProduto_ID);
    const analise = scoreProduto(item, row);
    const existente = grupos.get(cod);
    if (!existente) {
      grupos.set(cod, {
        CodProduto_ID: cod,
        DescricaoProduto: row.DescricaoProduto,
        ...analise,
        quantidadeFornecedores: 1,
        precoMin: Number(row.PrecoBaseConsulta || 0) > 0 ? Number(row.PrecoBaseConsulta) : null,
        precoMax: Number(row.PrecoBaseConsulta || 0) > 0 ? Number(row.PrecoBaseConsulta) : null,
        quantidadePrecos: Number(row.PrecoBaseConsulta || 0) > 0 ? 1 : 0,
        listaPreco: row.LPrecoConsulta || null,
        filialOrcamentoPreco: String(filialOrcamento || '01').trim() || '01',
        tipoApresentacao: row.TipoApresentacao || null,
        unidadeVenda: row.UnidadeMedidaVnds || row.UnidadeMedida || null,
        fatorConversaoVenda: Number(row.FatorConversaoVenda || 1),
        qtdeUnidade: Number(row.QtdeUnidade || 0),
        qtMinVenda: Number(row.QtMinVenda || 0),
        apresentacaoMista: false,
      });
    } else {
      existente.quantidadeFornecedores += 1;
      if (existente.tipoApresentacao && row.TipoApresentacao && existente.tipoApresentacao !== row.TipoApresentacao) {
        existente.apresentacaoMista = true;
      }
      const precoAtual = Number(row.PrecoBaseConsulta || 0);
      if (precoAtual > 0) {
        existente.precoMin = existente.precoMin == null ? precoAtual : Math.min(existente.precoMin, precoAtual);
        existente.precoMax = existente.precoMax == null ? precoAtual : Math.max(existente.precoMax, precoAtual);
        existente.quantidadePrecos += 1;
        if (!existente.listaPreco && row.LPrecoConsulta) existente.listaPreco = row.LPrecoConsulta;
      }
      if (analise.score > existente.score) {
        Object.assign(existente, analise, { DescricaoProduto: row.DescricaoProduto });
      }
    }
  }

  const candidatos = [...grupos.values()];
  const bitolaExata = candidatos.filter(g => g.bitolaCompativel);
  // Se existe qualquer produto com a bitola exata solicitada, descartamos da lista
  // produtos de outras bitolas. Ex.: pedido 6 mm nunca deve oferecer 16 mm.
  const base = bitolaExata.length ? bitolaExata : [];

  return base
    .sort((a, b) => Number(b.elegivelAuto) - Number(a.elegivelAuto) || b.score - a.score || b.quantidadeFornecedores - a.quantidadeFornecedores || a.CodProduto_ID - b.CodProduto_ID)
    .slice(0, 8)
    .map(g => ({
      ...g,
      confianca: g.elegivelAuto && g.score >= 90 ? 'alta' : g.score >= 60 ? 'media' : 'baixa',
    }));
}

async function buscarFornecedoresProduto(produto, pool, filialOrcamento = '01') {
  const r = await pool.request()
    .input('produto', sql.Int, Number(produto))
    .input('filialOrcamento', sql.VarChar(2), String(filialOrcamento || '01').trim() || '01')
    .query(`
      SELECT
        c.CodProduto_ID,
        c.CodFabricante_ID,
        c.DescricaoProduto,
        c.NomeFabricante,
        c.RefFabricante,
        e.Empresa,
        e.Filial,
        ISNULL(e.EstoqueFisico,0)  AS EstoqueFisico,
        ISNULL(e.SaldoVNDS,0)      AS SaldoVNDS,
        ISNULL(e.SaldoEXPE,0)      AS SaldoEXPE,
        ISNULL(e.EstoqueLiquido,0) AS EstoqueLiquido,
        h.CodOrcamento_ID          AS RefCodOrcamento,
        h.PrecoUnitario            AS RefPrecoUnitario,
        h.PrecoDesconto            AS RefPrecoDesconto,
        h.Quantidade               AS RefQuantidade,
        h.PrecoCusto               AS RefPrecoCusto,
        h.Margem                   AS RefMargem,
        h.NOper                    AS RefNOper,
        h.CodTributo               AS RefCodTributo,
        p.LPrecoConsulta            AS PrecoListaAtual,
        p.PrecoBaseConsulta         AS PrecoBaseAtual,
        p.MargemBaseConsulta        AS MargemBaseAtual,
        p.PrecoCusto                AS PrecoCustoAtual,
        p.EmpresaPreco              AS EmpresaPrecoAtual,
        p.FilialPreco               AS FilialPrecoAtual,
        a.UnidadeMedida,
        a.UnidadeMedidaVnds,
        a.QtdeUnidade,
        a.QtMinVenda,
        a.QtMinVenda_Multiplo,
        a.TipoApresentacao,
        a.FatorConversaoVenda,
        a.MultiploVenda
      FROM dbo.Aplicativo_vw_Comercial_CatalogoProdutoFornecedorTeste c
      LEFT JOIN dbo.Aplicativo_vw_Comercial_PrecoCustoBaseTeste p
             ON p.FilialOrcamento = @filialOrcamento
            AND p.CodProduto_ID = c.CodProduto_ID
            AND p.CodFabricante_ID = c.CodFabricante_ID
      LEFT JOIN dbo.Aplicativo_vw_Comercial_ApresentacaoProdutoTeste a
             ON a.CodProduto_ID = c.CodProduto_ID
            AND a.CodFabricante_ID = c.CodFabricante_ID
      LEFT JOIN dbo.Aplicativo_vw_Comercial_EstoqueDetalheTeste e
             ON e.CodProduto_ID = c.CodProduto_ID
            AND e.CodFabricante_ID = c.CodFabricante_ID
      OUTER APPLY (
        SELECT TOP 1
          x.CodOrcamento_ID,
          x.PrecoUnitario,
          x.PrecoDesconto,
          x.Quantidade,
          x.PrecoCusto,
          x.Margem,
          x.NOper,
          x.CodTributo
        FROM dbo.Aplicativo_vw_Comercial_OrcamentoItemDeak x
        WHERE x.CodProduto_ID = c.CodProduto_ID
          AND x.CodFabricante_ID = c.CodFabricante_ID
        ORDER BY x.CodOrcamento_ID DESC, x.NItem DESC
      ) h
      WHERE c.CodProduto_ID = @produto
      ORDER BY c.NomeFabricante, c.CodFabricante_ID, e.Filial
    `);

  const mapa = new Map();
  for (const row of r.recordset) {
    const fab = String(row.CodFabricante_ID || '');
    if (!mapa.has(fab)) {
      const qtdRef = Number(row.RefQuantidade || 0);
      const vlrRef = Number(row.RefPrecoDesconto || 0);
      const unitNegRef = qtdRef > 0 && vlrRef > 0 ? Number((vlrRef / qtdRef).toFixed(6)) : null;
      mapa.set(fab, {
        CodProduto_ID: Number(row.CodProduto_ID),
        CodFabricante_ID: fab,
        DescricaoProduto: row.DescricaoProduto,
        NomeFabricante: row.NomeFabricante || fab,
        RefFabricante: row.RefFabricante,
        estoqueLiquidoTotal: 0,
        estoqueFisicoTotal: 0,
        filiais: [],
        precoAtualBase: Number(row.PrecoBaseAtual || 0) > 0 ? {
          lista: row.PrecoListaAtual || 'LP1',
          precoBase: n(row.PrecoBaseAtual),
          margemBase: n(row.MargemBaseAtual),
          custoBase: n(row.PrecoCustoAtual),
          empresaPreco: row.EmpresaPrecoAtual || null,
          filialPreco: row.FilialPrecoAtual || null,
          filialOrcamento: String(filialOrcamento || '01').trim() || '01',
        } : null,
        apresentacao: {
          tipo: row.TipoApresentacao || 'UNIDADE',
          unidadeMedida: row.UnidadeMedida || null,
          unidadeVenda: row.UnidadeMedidaVnds || row.UnidadeMedida || null,
          qtdeUnidade: n(row.QtdeUnidade) || 0,
          qtMinVenda: n(row.QtMinVenda) || 0,
          qtMinVendaMultiplo: n(row.QtMinVenda_Multiplo) || 0,
          fatorConversao: n(row.FatorConversaoVenda) || 1,
          multiploVenda: n(row.MultiploVenda) || 0,
        },
        ultimaReferencia: row.RefCodOrcamento ? {
          CodOrcamento_ID: Number(row.RefCodOrcamento),
          PrecoUnitario: n(row.RefPrecoUnitario),
          PrecoNegociado: unitNegRef,
          PrecoCusto: n(row.RefPrecoCusto),
          Margem: n(row.RefMargem),
          NOper: row.RefNOper || null,
          CodTributo: row.RefCodTributo || null,
        } : null,
      });
    }
    const f = mapa.get(fab);
    if (row.Filial !== null && row.Filial !== undefined) {
      const filial = {
        Empresa: row.Empresa,
        Filial: String(row.Filial),
        EstoqueFisico: Number(row.EstoqueFisico || 0),
        SaldoVNDS: Number(row.SaldoVNDS || 0),
        SaldoEXPE: Number(row.SaldoEXPE || 0),
        EstoqueLiquido: Number(row.EstoqueLiquido || 0),
      };
      f.filiais.push(filial);
      f.estoqueLiquidoTotal += filial.EstoqueLiquido;
      f.estoqueFisicoTotal += filial.EstoqueFisico;
    }
  }

  return [...mapa.values()].sort((a, b) =>
    b.estoqueLiquidoTotal - a.estoqueLiquidoTotal || String(a.NomeFabricante).localeCompare(String(b.NomeFabricante))
  );
}

app.post('/api/solicitacao/analisar', async (req, res, next) => {
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ erro: 'Cole a solicitação do cliente.' });

    const parsed = interpretarSolicitacao(texto);
    if (!parsed.itens.length) {
      return res.status(422).json({ erro: 'Nenhum item estruturado foi identificado na solicitação.' });
    }

    const pool = await getPool();
    const filialOrcamento = String(req.body?.filial || '01').trim() || '01';
    const itens = await Promise.all(parsed.itens.map(async item => {
      const sugestoes = await buscarCandidatosProduto(item, pool, filialOrcamento);
      const selecionado = sugestoes.find(s => s.elegivelAuto) || null;
      const fornecedores = selecionado
        ? await buscarFornecedoresProduto(selecionado.CodProduto_ID, pool, filialOrcamento)
        : [];
      return {
        ...item,
        sugestoes,
        produtoSelecionado: selecionado,
        fornecedores,
        requerConferenciaProduto: !selecionado,
      };
    }));

    res.json({ ...parsed, itens });
  } catch (err) { next(err); }
});

app.get('/api/produtos/:produto/fornecedores', async (req, res, next) => {
  try {
    const produto = Number(req.params.produto);
    if (!Number.isInteger(produto) || produto <= 0) {
      return res.status(400).json({ erro: 'Produto inválido.' });
    }
    const pool = await getPool();
    const filialOrcamento = String(req.query?.filial || '01').trim() || '01';
    const fornecedores = await buscarFornecedoresProduto(produto, pool, filialOrcamento);
    res.json({ produto, fornecedores });
  } catch (err) { next(err); }
});

app.get('/api/produtos/pesquisar/texto', async (req, res, next) => {
  try {
    const termo = String(req.query.q || '').trim();
    if (termo.length < 2) return res.status(400).json({ erro: 'Informe ao menos 2 caracteres.' });
    const pool = await getPool();
    const like = `%${semAcento(termo)}%`;
    const r = await pool.request()
      .input('termo', sql.VarChar(120), like)
      .query(`
        SELECT TOP 80
          CodProduto_ID,
          CodFabricante_ID,
          DescricaoProduto,
          NomeFabricante,
          RefFabricante
        FROM dbo.Aplicativo_vw_Comercial_CatalogoProdutoFornecedorTeste
        WHERE UPPER(DescricaoProduto) LIKE @termo
           OR UPPER(NomeFabricante) LIKE @termo
           OR UPPER(CONVERT(VARCHAR(150),RefFabricante)) LIKE @termo
           OR CONVERT(VARCHAR(30),CodProduto_ID) LIKE @termo
        ORDER BY CodProduto_ID, NomeFabricante
      `);
    res.json(r.recordset);
  } catch (err) { next(err); }
});



// ===== S2.1 · preço/custo base atual + simulação financeira =====
app.get('/api/precos/base', async (req, res, next) => {
  try {
    const filial = String(req.query.filial || '01').trim() || '01';
    const produto = Number(req.query.produto);
    const fabricante = String(req.query.fabricante || '').trim();
    const custoFinanc = Number(req.query.custoFinanc || 0);
    const margem = req.query.margem === undefined || req.query.margem === '' ? null : Number(req.query.margem);
    if (!Number.isInteger(produto) || produto <= 0) return res.status(400).json({ erro: 'Produto inválido.' });
    if (!fabricante) return res.status(400).json({ erro: 'Fabricante inválido.' });

    const pool = await getPool();
    const base = await buscarPrecoCustoBase(pool, filial, produto, fabricante);
    if (!base) return res.status(404).json({ erro: 'Preço/custo base não localizado para a filial comercial, produto e fabricante.' });

    const motor = calcularMotorPrecoS21(base, custoFinanc, margem);
    res.json({
      filialOrcamento: filial,
      base: {
        empresaPreco: base.EmpresaPreco,
        filialPreco: base.FilialPreco,
        lista: base.LPrecoConsulta,
        precoCusto: n(base.PrecoCusto),
        precoCompra: n(base.PrecoCompra),
        precoLP1: n(base.PrecoLP1),
        precoLP2: n(base.PrecoLP2),
        precoLP3: n(base.PrecoLP3),
        margemLP1: n(base.MargemLP1),
        margemLP2: n(base.MargemLP2),
        margemLP3: n(base.MargemLP3),
        precoBaseConsulta: n(base.PrecoBaseConsulta),
        margemBaseConsulta: n(base.MargemBaseConsulta),
        precoDtAtu: base.PrecoDtAtu,
        precoUsuario: base.PrecoUsuario,
      },
      motor
    });
  } catch (err) { next(err); }
});



// ===== S2.2A · usuário + limites + margem mínima do produto =====
app.get('/api/comercial/alcada', async (req, res, next) => {
  try {
    const usuario = String(req.query.usuario || '').trim();
    const produto = Number(req.query.produto);
    const fabricante = String(req.query.fabricante || '').trim();
    if (!usuario) return res.status(400).json({ erro: 'Informe o usuário/vendedor Deak para consultar a alçada.' });
    if (!Number.isInteger(produto) || produto <= 0) return res.status(400).json({ erro: 'Produto inválido.' });
    if (!fabricante) return res.status(400).json({ erro: 'Fabricante inválido.' });

    const pool = await getPool();
    const [u, p] = await Promise.all([
      buscarAlcadaUsuarioS22(pool, usuario),
      buscarMargemMinimaProdutoS22(pool, produto, fabricante),
    ]);

    res.json({
      modo: 'DIAGNOSTICO_S2.2A',
      homologadoParaBloqueio: false,
      usuarioConsultado: usuario,
      usuario: u ? {
        usuario: u.Usuario,
        pergrupo: u.Pergrupo,
        usuarioPai: u.UsuarioPai,
        grupo: u.Grupo,
        funcao: u.Funcao,
        listaPrecoMinima: u.ListaPrecoMinima,
      } : null,
      regras: {
        markup: u && u.MarkupValorMax != null ? { valorMax: n(u.MarkupValorMax), flgValor: String(u.MarkupFlgValor || '').trim() } : null,
        markupMin: u && u.MarkupMinValorMax != null ? { valorMax: n(u.MarkupMinValorMax), flgValor: String(u.MarkupMinFlgValor || '').trim() } : null,
      },
      produto: {
        codProdutoId: produto,
        codFabricanteId: fabricante,
        margemMinima: p ? n(p.MargemMinima) : 0,
      },
      observacao: 'S2.2A usa a leitura real do Deak, mas a interpretação combinada Markup/Markup Min permanece em homologação e não bloqueia venda.',
    });
  } catch (err) { next(err); }
});

// ===== S1.5 · Cliente real do Deak =====
function pickAny(obj, nomes, fallback = null) {
  if (!obj) return fallback;
  const keys = Object.keys(obj);
  const map = new Map(keys.map(k => [String(k).toLowerCase(), k]));
  for (const nome of nomes) {
    const real = map.get(String(nome).toLowerCase());
    if (real !== undefined) {
      const v = obj[real];
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
  }
  return fallback;
}

function normalizarCliente(row) {
  if (!row) return null;
  const cgc = String(pickAny(row, ['CGC','Cgc','CPF_CNPJ','CNPJCPF'], '') || '').trim();
  return {
    cgc,
    nome: textoSeguro(pickAny(row, ['Nome','NOME','RazaoSocial','Razao_Social']), 150),
    fantasia: textoSeguro(pickAny(row, ['Apelido','Fantasia','NomeFantasia','Nome_Fantasia']), 150),
    codigoExterno: textoSeguro(pickAny(row, ['CodigoExterno','CodExterno','Codigo_Externo']), 60),
    vendedor: textoSeguro(pickAny(row, ['CodVendedor_ID','CodVendedor','Vendedor_ID','Vendedor','CodVend']), 50),
    telefone: textoSeguro(pickAny(row, ['Telefone','Fone','Fone1','Tel','Telefone1','ContatoFone']), 60),
    email: textoSeguro(pickAny(row, ['Email','E-mail','EMail','EmailNFe']), 160),
    contato: textoSeguro(pickAny(row, ['Contato','NomeContato','ContNome']), 150),
    endereco: textoSeguro(pickAny(row, ['Endereco','EndRes','Logradouro','Endereço']), 200),
    numero: textoSeguro(pickAny(row, ['Numero','NumRes','NumeroEndereco']), 30),
    complemento: textoSeguro(pickAny(row, ['Complemento','ComplRes']), 100),
    bairro: textoSeguro(pickAny(row, ['Bairro','BaiRes']), 100),
    cidade: textoSeguro(pickAny(row, ['Cidade','CidRes','Municipio']), 100),
    uf: textoSeguro(pickAny(row, ['EstRes','Estado','UF','UfRes']), 2),
    cep: textoSeguro(pickAny(row, ['CEP','Cep','CepRes']), 12),
  };
}

async function buscarClienteCompleto(pool, cgc) {
  const r = await pool.request()
    .input('cgc', sql.VarChar(30), String(cgc || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_ClientesTeste
      WHERE CGC = @cgc
    `);
  if (!r.recordset.length) return null;
  const cadastro = normalizarCliente(r.recordset[0]);

  const cr = await pool.request()
    .input('cgc', sql.VarChar(30), String(cgc || '').trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.Aplicativo_vw_Comercial_ClienteCreditoTeste
      WHERE CGC = @cgc
    `);

  const c = cr.recordset[0] || {};

  // S1.6: sugestão comercial baseada no último orçamento real do cliente.
  // É apenas sugestão visual: o usuário ainda precisa confirmar condição e forma de pagamento.
  let ultimaCondicao = null;
  try {
    const uc = await pool.request()
      .input('cgc', sql.VarChar(30), String(cgc || '').trim())
      .query(`
        SELECT TOP 1 *
        FROM dbo.Aplicativo_vw_Comercial_ClienteUltimaCondicaoTeste
        WHERE CGC = @cgc
      `);
    if (uc.recordset.length) {
      const u = uc.recordset[0];
      ultimaCondicao = {
        codOrcamento: Number(u.CodOrcamento_ID || 0),
        condPagtoId: u.CondPagto_ID == null ? null : String(u.CondPagto_ID),
        condPagtoDescricao: u.CondPagtoDescricao || null,
        custoFinanc: Number(u.CustoFinanc || 0),
        fPagto: u.FPagto == null ? null : Number(u.FPagto),
        formaPagamentoDescricao: u.FormaPagamentoDescricao || null
      };
    }
  } catch (_) {
    // Mantém compatibilidade caso o SQL S1.6 ainda não tenha sido executado.
  }

  return {
    cadastro,
    credito: {
      limite: Number(c.LimiteCredito || 0),
      validade: c.ValidadeCredito || null,
      dataAtualizacao: c.DataAtualizacaoCredito || null,
      diasAtrasoCadastro: Number(c.DiasAtrasoCadastro || 0),
      valorEmAberto: Number(c.ValorEmAberto || 0),
      valorVencido: Number(c.ValorVencido || 0),
      titulosVencidos: Number(c.QtdeTitulosVencidos || 0),
      pedidosEmAberto: Number(c.PedidosEmAberto || 0),
      ultimaNF: c.UltimaNF || null,
      observacao: 'Consulta complementar. A análise/aprovação de crédito pertence à ferramenta específica de Análise de Crédito.'
    },
    ultimaCondicao
  };
}

app.get('/api/clientes/pesquisar', async (req, res, next) => {
  try {
    const termo = String(req.query.q || '').trim();
    if (termo.length < 2) return res.status(400).json({ erro: 'Digite ao menos 2 caracteres para pesquisar o cliente.' });
    const pool = await getPool();
    const doc = termo.replace(/\D/g, '');
    const like = `%${termo}%`;
    const docLike = `%${doc || termo}%`;
    const r = await pool.request()
      .input('like', sql.VarChar(180), like)
      .input('docLike', sql.VarChar(40), docLike)
      .query(`
        SELECT TOP 30 *
        FROM dbo.Aplicativo_vw_Comercial_ClientesTeste
        WHERE
          REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(CGC,''),'.',''),'/',''),'-',''),' ','') LIKE @docLike
          OR ISNULL(Nome,'') LIKE @like
          OR ISNULL(Apelido,'') LIKE @like
          OR ISNULL(CodigoExterno,'') LIKE @like
        ORDER BY
          CASE WHEN REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(CGC,''),'.',''),'/',''),'-',''),' ','') = REPLACE(REPLACE(REPLACE(REPLACE(@docLike,'%',''),'.',''),'/',''),'-','') THEN 0 ELSE 1 END,
          Nome
      `);
    res.json({ resultados: r.recordset.map(normalizarCliente) });
  } catch (err) { next(err); }
});

app.get('/api/clientes/:cgc', async (req, res, next) => {
  try {
    const pool = await getPool();
    const data = await buscarClienteCompleto(pool, req.params.cgc);
    if (!data) return res.status(404).json({ erro: 'Cliente não encontrado no cadastro do Deak.' });
    res.json(data);
  } catch (err) { next(err); }
});
// ===== fim S1.5 cliente =====

// ===== S1.6 · Condição e forma de pagamento =====
async function buscarCondicaoPagamento(pool, condPagtoId) {
  const id = String(condPagtoId || '').trim();
  if (!id) return null;
  const r = await pool.request()
    .input('id', sql.VarChar(20), id)
    .query(`
      SELECT TOP 1 CondPagto_ID, Descricao, CustoFinanc, EXCLUI, QtdeParcelas, PrimeiroDia, UltimoDia
      FROM dbo.Aplicativo_vw_Comercial_CondPagamentoTeste
      WHERE CondPagto_ID = @id
    `);
  if (!r.recordset.length) return null;
  const c = r.recordset[0];

  const [pr, fr] = await Promise.all([
    pool.request()
      .input('id', sql.VarChar(20), id)
      .query(`
        SELECT Dias
        FROM dbo.Aplicativo_vw_Comercial_CondPagamentoParcelasTeste
        WHERE CondPagto_ID = @id
        ORDER BY Dias
      `),
    pool.request()
      .input('id', sql.VarChar(20), id)
      .query(`
        SELECT CondPagto_ID, FPagto, Descricao
        FROM dbo.Aplicativo_vw_Comercial_CondPagamentoFormasTeste
        WHERE CondPagto_ID = @id
        ORDER BY FPagto
      `)
  ]);

  return {
    condPagtoId: String(c.CondPagto_ID),
    descricao: c.Descricao || '',
    custoFinanc: Number(c.CustoFinanc || 0),
    exclui: c.EXCLUI == null ? null : String(c.EXCLUI),
    qtdeParcelas: Number(c.QtdeParcelas || 0),
    primeiroDia: c.PrimeiroDia == null ? null : Number(c.PrimeiroDia),
    ultimoDia: c.UltimoDia == null ? null : Number(c.UltimoDia),
    parcelasDias: pr.recordset.map(x => Number(x.Dias)).filter(Number.isFinite),
    formasPermitidas: fr.recordset.map(x => ({
      fPagto: Number(x.FPagto),
      descricao: x.Descricao || ''
    }))
  };
}

async function buscarFormaPagamento(pool, fPagto) {
  const n = Number(fPagto);
  if (!Number.isInteger(n) || n <= 0) return null;
  const r = await pool.request()
    .input('f', sql.Int, n)
    .query(`
      SELECT TOP 1 FPagto, Descricao
      FROM dbo.Aplicativo_vw_Comercial_FormaPagamentoTeste
      WHERE FPagto = @f
    `);
  if (!r.recordset.length) return null;
  return { fPagto: Number(r.recordset[0].FPagto), descricao: r.recordset[0].Descricao || '' };
}

async function formaPermitidaParaCondicao(pool, condPagtoId, fPagto) {
  const id = String(condPagtoId || '').trim();
  const n = Number(fPagto);
  if (!id || !Number.isInteger(n) || n <= 0) return false;
  const r = await pool.request()
    .input('id', sql.VarChar(20), id)
    .input('f', sql.Int, n)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.Aplicativo_vw_Comercial_CondPagamentoFormasTeste
      WHERE CondPagto_ID = @id
        AND FPagto = @f
    `);
  return r.recordset.length > 0;
}

app.get('/api/pagamento/opcoes', async (req, res, next) => {
  try {
    const pool = await getPool();
    const [c, f] = await Promise.all([
      pool.request().query(`
        SELECT
          c.CondPagto_ID,
          c.Descricao,
          c.CustoFinanc,
          c.EXCLUI,
          c.QtdeParcelas,
          c.PrimeiroDia,
          c.UltimoDia,
          QtdeFormasPermitidas = COUNT(cf.FPagto)
        FROM dbo.Aplicativo_vw_Comercial_CondPagamentoTeste c
        LEFT JOIN dbo.Aplicativo_vw_Comercial_CondPagamentoFormasTeste cf
          ON cf.CondPagto_ID = c.CondPagto_ID
        GROUP BY
          c.CondPagto_ID, c.Descricao, c.CustoFinanc, c.EXCLUI,
          c.QtdeParcelas, c.PrimeiroDia, c.UltimoDia
        ORDER BY c.Descricao, c.CondPagto_ID
      `),
      pool.request().query(`
        SELECT FPagto, Descricao
        FROM dbo.Aplicativo_vw_Comercial_FormaPagamentoTeste
        ORDER BY FPagto
      `)
    ]);
    res.json({
      condicoes: c.recordset.map(x => ({
        condPagtoId: String(x.CondPagto_ID),
        descricao: x.Descricao || '',
        custoFinanc: Number(x.CustoFinanc || 0),
        exclui: x.EXCLUI == null ? null : String(x.EXCLUI),
        qtdeParcelas: Number(x.QtdeParcelas || 0),
        primeiroDia: x.PrimeiroDia == null ? null : Number(x.PrimeiroDia),
        ultimoDia: x.UltimoDia == null ? null : Number(x.UltimoDia),
        qtdeFormasPermitidas: Number(x.QtdeFormasPermitidas || 0)
      })),
      formas: f.recordset.map(x => ({ fPagto: Number(x.FPagto), descricao: x.Descricao || '' }))
    });
  } catch (err) { next(err); }
});

app.get('/api/pagamento/condicoes/:id', async (req, res, next) => {
  try {
    const pool = await getPool();
    const data = await buscarCondicaoPagamento(pool, req.params.id);
    if (!data) return res.status(404).json({ erro: 'Condição de pagamento não encontrada no Deak.' });
    res.json(data);
  } catch (err) { next(err); }
});
// ===== fim S1.6 =====

// ===== S1.3 · Montagem do orçamento TESTE + seleção da filial de estoque =====
function textoSeguro(v, max = 200) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

function calcularItemRascunho(item) {
  const quantidade = Number(item.quantidade || 0);
  const precoReferencia = Number(item.precoReferencia || 0);
  const desconto = Math.max(0, Math.min(100, Number(item.descontoPercentual || 0)));
  const precoNegociado = precoReferencia > 0 ? precoReferencia * (1 - desconto / 100) : 0;
  const totalLista = quantidade * precoReferencia;
  const totalNegociado = quantidade * precoNegociado;
  return {
    quantidade,
    precoReferencia: Number(precoReferencia.toFixed(6)),
    descontoPercentual: Number(desconto.toFixed(6)),
    precoNegociado: Number(precoNegociado.toFixed(6)),
    totalLista: Number(totalLista.toFixed(2)),
    totalNegociado: Number(totalNegociado.toFixed(2)),
  };
}

app.post('/api/solicitacao/criar-orcamento-teste', async (req, res, next) => {
  try {
    const body = req.body || {};
    const clienteRecebidoInicial = body.cliente || {};
    const filialOrcamento = textoSeguro(clienteRecebidoInicial.filial, 2) || '01';
    const itensRecebidos = Array.isArray(body.itens) ? body.itens : [];
    if (!itensRecebidos.length) return res.status(400).json({ erro: 'Nenhum item foi enviado para o orçamento TESTE.' });

    const itens = itensRecebidos.map((item, idx) => {
      const produto = Number(item.CodProduto_ID);
      const fabricante = String(item.CodFabricante_ID || '').trim();
      // quantidade = unidade de venda/estoque que será gravada no Deak (ex.: MT)
      // quantidadeComercial = o que o vendedor informa na apresentação comercial
      //   ROLO_FIXO: MT confirmados (com sugestão derivada da solicitação e regra de mínimo/múltiplo); CARRETEL/BOBINA/METRO: metros; BLISTER/UNIDADE: peças.
      const quantidadeComercial = Number(item.quantidadeComercial ?? item.quantidade ?? 0);
      const quantidadeSolicitadaCliente = Number(item.quantidadeSolicitadaCliente ?? item.quantidadeSolicitada ?? item.quantidade ?? 0);
      const calc = calcularItemRascunho(item);
      const filialEstoque = String(item.FilialEstoque || '').trim();
      const empresaEstoque = String(item.EmpresaEstoque || '01').trim() || '01';
      if (!Number.isInteger(produto) || produto <= 0) throw Object.assign(new Error(`Linha ${idx + 1}: produto inválido.`), { status: 422 });
      if (!fabricante) throw Object.assign(new Error(`Linha ${idx + 1}: escolha o fornecedor/fabricante.`), { status: 422 });
      if (!filialEstoque) throw Object.assign(new Error(`Linha ${idx + 1}: escolha a filial de origem do estoque.`), { status: 422 });
      if (!(quantidadeComercial > 0)) throw Object.assign(new Error(`Linha ${idx + 1}: quantidade comercial inválida.`), { status: 422 });
      if (!(calc.precoReferencia > 0)) throw Object.assign(new Error(`Linha ${idx + 1}: informe/confirme o preço de referência.`), { status: 422 });
      return {
        ...item, ...calc,
        QuantidadeComercial: quantidadeComercial,
        QuantidadeSolicitadaCliente: quantidadeSolicitadaCliente,
        CodProduto_ID: produto,
        CodFabricante_ID: fabricante,
        EmpresaEstoque: empresaEstoque,
        FilialEstoque: filialEstoque,
        SolicitacaoCategoria: textoSeguro(item.SolicitacaoCategoria, 80),
        SolicitacaoBitola: Number(item.SolicitacaoBitola),
        SolicitacaoCor: textoSeguro(item.SolicitacaoCor, 40),
        NItem: idx + 1
      };
    });

    const pool = await getPool();

    // S1.5: o cliente precisa existir no cadastro real do Deak.
    const clienteRecebido = clienteRecebidoInicial;
    const cgcSelecionado = textoSeguro(clienteRecebido.cgc, 30);
    if (!cgcSelecionado) {
      throw Object.assign(new Error('Selecione um cliente real do Deak antes de criar o orçamento TESTE.'), { status: 422 });
    }
    const clienteReal = await buscarClienteCompleto(pool, cgcSelecionado);
    if (!clienteReal || !clienteReal.cadastro) {
      throw Object.assign(new Error('O cliente selecionado não foi localizado novamente no Deak.'), { status: 422 });
    }

    // S1.6.1: condição é escolhida primeiro; a forma precisa pertencer às formas oficiais vinculadas à condição e tudo é revalidado no Deak.
    const pagamentoRecebido = body.pagamento || {};
    const condPagtoIdSelecionado = textoSeguro(pagamentoRecebido.condPagtoId, 20);
    const fPagtoSelecionado = Number(pagamentoRecebido.fPagto);
    if (!condPagtoIdSelecionado) {
      throw Object.assign(new Error('Selecione a condição de pagamento antes de criar o orçamento TESTE.'), { status: 422 });
    }
    if (!Number.isInteger(fPagtoSelecionado) || fPagtoSelecionado <= 0) {
      throw Object.assign(new Error('Selecione a forma de pagamento antes de criar o orçamento TESTE.'), { status: 422 });
    }
    const condicaoPagamentoReal = await buscarCondicaoPagamento(pool, condPagtoIdSelecionado);
    if (!condicaoPagamentoReal) {
      throw Object.assign(new Error('A condição de pagamento selecionada não foi localizada novamente no Deak.'), { status: 422 });
    }
    const formaPagamentoReal = await buscarFormaPagamento(pool, fPagtoSelecionado);
    if (!formaPagamentoReal) {
      throw Object.assign(new Error('A forma de pagamento selecionada não foi localizada novamente no Deak.'), { status: 422 });
    }

    // S1.6.1: a forma precisa estar oficialmente vinculada à condição em CondPagamentoFormas.
    const formasPermitidas = Array.isArray(condicaoPagamentoReal.formasPermitidas)
      ? condicaoPagamentoReal.formasPermitidas
      : [];
    if (!formasPermitidas.length) {
      throw Object.assign(new Error(
        `A condição ${condicaoPagamentoReal.condPagtoId} (${condicaoPagamentoReal.descricao}) não possui forma de pagamento vinculada em CondPagamentoFormas.`
      ), { status: 422 });
    }
    const vinculoOk = await formaPermitidaParaCondicao(pool, condicaoPagamentoReal.condPagtoId, formaPagamentoReal.fPagto);
    if (!vinculoOk) {
      throw Object.assign(new Error(
        `A forma ${formaPagamentoReal.fPagto} (${formaPagamentoReal.descricao}) não é permitida para a condição ${condicaoPagamentoReal.condPagtoId} (${condicaoPagamentoReal.descricao}).`
      ), { status: 422 });
    }

    // S2.1.3.3: resolve apresentação/unidade oficial antes de preço e estoque.
    // A quantidade confirmada já está na unidade base do Deak.
    // ROLO_FIXO usa MT com mínimo/múltiplos oficiais; CARRETEL/BOBINA usam corte em MT;
    // BLISTER/UNIDADE é direto na unidade cadastrada.
    for (const item of itens) {
      const apresentacao = await buscarApresentacaoProduto(pool, item.CodProduto_ID, item.CodFabricante_ID);
      if (!apresentacao) {
        throw Object.assign(new Error(`Item ${item.NItem}: apresentação/unidade do produto não localizada no Deak.`), { status: 422 });
      }
      const tipo = String(apresentacao.TipoApresentacao || 'UNIDADE').trim().toUpperCase();
      const fator = Number(apresentacao.FatorConversaoVenda || 1);
      const qtMinVenda = Number(apresentacao.QtMinVenda || 0);
      const usaMultiplo = Number(apresentacao.QtMinVenda_Multiplo || 0) === 1;
      const multiploVenda = Number(apresentacao.MultiploVenda || (usaMultiplo ? qtMinVenda : 0));
      const quantidadeDeak = quantidadeDeakPorApresentacao(apresentacao, item.QuantidadeComercial);
      if (!(quantidadeDeak > 0)) {
        throw Object.assign(new Error(`Item ${item.NItem}: quantidade de venda inválida para a apresentação ${tipo}.`), { status: 422 });
      }
      if (qtMinVenda > 0 && quantidadeDeak + 0.000001 < qtMinVenda) {
        throw Object.assign(new Error(`Item ${item.NItem}: quantidade mínima para venda: ${qtMinVenda} ${apresentacao.UnidadeMedidaVnds || apresentacao.UnidadeMedida || ''}.`), { status: 422 });
      }
      if (usaMultiplo && multiploVenda > 0 && !quantidadeRespeitaMultiplo(quantidadeDeak, multiploVenda)) {
        throw Object.assign(new Error(`Item ${item.NItem}: produto deve ser vendido em múltiplos de ${multiploVenda} ${apresentacao.UnidadeMedidaVnds || apresentacao.UnidadeMedida || ''}.`), { status: 422 });
      }
      const calcRefeito = calcularItemRascunho({
        quantidade: quantidadeDeak,
        precoReferencia: item.precoReferencia,
        descontoPercentual: item.descontoPercentual,
      });
      Object.assign(item, calcRefeito);
      item.TipoApresentacao = tipo;
      item.FatorConversaoVenda = fator > 0 ? fator : 1;
      item.UnidadeMedida_ID = textoSeguro(apresentacao.UnidadeMedidaVnds || apresentacao.UnidadeMedida, 10);
      item.QtdeUnidadeCadastro = Number(apresentacao.QtdeUnidade || 0);
      item.QtMinVendaCadastro = Number(apresentacao.QtMinVenda || 0);
      item.QtMinVendaMultiploCadastro = Number(apresentacao.QtMinVenda_Multiplo || 0);
      item.MultiploVendaCadastro = Number(apresentacao.MultiploVenda || 0);
    }

    // S2.1: reconsulta o preço/custo base atual usando a FILIAL DO ORÇAMENTO,
    // e não a filial física escolhida para retirar estoque.
    // A simulação financeira é registrada para homologação; o preço confirmado pelo
    // vendedor continua editável nesta etapa.
    for (const item of itens) {
      const basePreco = await buscarPrecoCustoBase(pool, filialOrcamento, item.CodProduto_ID, item.CodFabricante_ID);
      if (!basePreco) {
        throw Object.assign(new Error(
          `Item ${item.NItem}: não existe preço/custo base em LPreco para a Filial do Orçamento ${filialOrcamento}, produto ${item.CodProduto_ID} e fabricante ${item.CodFabricante_ID}.`
        ), { status: 422 });
      }
      const motor = calcularMotorPrecoS21(basePreco, condicaoPagamentoReal.custoFinanc);
      if (!motor.valido) {
        throw Object.assign(new Error(`Item ${item.NItem}: motor S2.1 não pôde calcular o preço. ${motor.motivo}`), { status: 422 });
      }
      item.PrecoBaseDeak = motor.precoBase;
      item.PrecoCustoOri = motor.custoBase;
      item.MargemBaseDeak = motor.margemBase;
      item.CargaBasePercentual = motor.cargaBasePercentual;
      item.PrecoMotorS21 = motor.precoVendaFinal;
      item.PrecoCustoApuradoS21 = motor.precoCustoApurado;
      item.ListaPrecoS21 = motor.lista;
      item.EmpresaPreco = textoSeguro(basePreco.EmpresaPreco, 2);
      item.FilialPreco = textoSeguro(basePreco.FilialPreco, 2);
      item.PrecoDtAtu = basePreco.PrecoDtAtu || null;
      item.PrecoUsuario = textoSeguro(basePreco.PrecoUsuario, 50);
      item.DiferencaPrecoMotor = arred6(item.precoReferencia - item.PrecoMotorS21);
      item.PrecoMotorFoiUsado = Math.abs(item.DiferencaPrecoMotor) <= 0.00001 && Number(item.descontoPercentual || 0) === 0;
      item.PrecoCustoPersistir = item.PrecoMotorFoiUsado ? item.PrecoCustoApuradoS21 : null;
      item.MargemPersistir = item.PrecoMotorFoiUsado ? item.MargemBaseDeak : null;
    }

    // Validação server-side do PRODUTO. Não confiamos somente na seleção feita no navegador.
    // A bitola solicitada deve ser exatamente a mesma da descrição cadastrada.
    for (const item of itens) {
      const cat = await pool.request()
        .input('produto', sql.Int, item.CodProduto_ID)
        .input('fabricante', sql.VarChar(20), item.CodFabricante_ID)
        .query(`
          SELECT TOP 1 CodProduto_ID, CodFabricante_ID, DescricaoProduto, NomeFabricante, RefFabricante
          FROM dbo.Aplicativo_vw_Comercial_CatalogoProdutoFornecedorTeste
          WHERE CodProduto_ID = @produto AND CodFabricante_ID = @fabricante
        `);

      if (!cat.recordset.length) {
        throw Object.assign(new Error(`Item ${item.NItem}: produto/fabricante não localizado no catálogo.`), { status: 422 });
      }

      const cadastrado = cat.recordset[0];
      item.DescricaoProduto = cadastrado.DescricaoProduto;
      item.NomeFabricante = cadastrado.NomeFabricante;
      item.RefFabricante = cadastrado.RefFabricante;

      if (Number.isFinite(item.SolicitacaoBitola) && item.SolicitacaoBitola > 0) {
        if (!temBitola(cadastrado.DescricaoProduto, item.SolicitacaoBitola)) {
          throw Object.assign(new Error(
            `Item ${item.NItem}: bitola incompatível. Solicitado ${item.SolicitacaoBitola} mm, mas o produto selecionado é "${cadastrado.DescricaoProduto}".`
          ), { status: 422 });
        }
      }

      if (item.SolicitacaoCor) {
        const cor = compatibilidadeCor(cadastrado.DescricaoProduto, item.SolicitacaoCor);
        if (cor.temOutraCor && !cor.encontrouSolicitada) {
          throw Object.assign(new Error(
            `Item ${item.NItem}: cor incompatível. Solicitado ${item.SolicitacaoCor}, mas o produto selecionado é "${cadastrado.DescricaoProduto}".`
          ), { status: 422 });
        }
      }
    }

    // Validação server-side da filial escolhida. Não confiamos apenas no saldo exibido pelo navegador.
    for (const item of itens) {
      const estoque = await pool.request()
        .input('produto', sql.Int, item.CodProduto_ID)
        .input('fabricante', sql.VarChar(20), item.CodFabricante_ID)
        .input('empresa', sql.VarChar(2), item.EmpresaEstoque)
        .input('filial', sql.VarChar(2), item.FilialEstoque)
        .query(`
          SELECT TOP 1
            Empresa, Filial,
            ISNULL(EstoqueFisico,0) AS EstoqueFisico,
            ISNULL(SaldoVNDS,0) AS SaldoVNDS,
            ISNULL(SaldoEXPE,0) AS SaldoEXPE,
            ISNULL(EstoqueLiquido,0) AS EstoqueLiquido
          FROM dbo.Aplicativo_vw_Comercial_EstoqueDetalheTeste
          WHERE CodProduto_ID = @produto
            AND CodFabricante_ID = @fabricante
            AND Empresa = @empresa
            AND Filial = @filial
        `);

      if (!estoque.recordset.length) {
        throw Object.assign(new Error(`Item ${item.NItem}: filial ${item.FilialEstoque} não localizada para o produto/fabricante selecionado.`), { status: 422 });
      }

      const e = estoque.recordset[0];
      item.EstoqueFisico = Number(e.EstoqueFisico || 0);
      item.SaldoVNDS = Number(e.SaldoVNDS || 0);
      item.SaldoEXPE = Number(e.SaldoEXPE || 0);
      item.EstoqueLiquido = Number(e.EstoqueLiquido || 0);

      if (!(item.EstoqueLiquido > 0)) {
        throw Object.assign(new Error(`Item ${item.NItem}: a Filial ${item.FilialEstoque} está sem estoque líquido disponível.`), { status: 422 });
      }
      if (item.quantidade > item.EstoqueLiquido) {
        throw Object.assign(new Error(`Item ${item.NItem}: quantidade ${item.quantidade} superior ao estoque líquido ${item.EstoqueLiquido} da Filial ${item.FilialEstoque}.`), { status: 422 });
      }
    }

    const t = new sql.Transaction(pool);
    await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const totalLista = Number(itens.reduce((s, i) => s + i.totalLista, 0).toFixed(2));
      const totalNegociado = Number(itens.reduce((s, i) => s + i.totalNegociado, 0).toFixed(2));
      const cliente = body.cliente || {};
      const cadastroCliente = clienteReal.cadastro;
      const cgc = textoSeguro(cadastroCliente.cgc, 20);
      const nomeCliente = textoSeguro(cadastroCliente.nome, 150) || textoSeguro(cadastroCliente.fantasia, 150) || 'CLIENTE DEAK';
      const filial = filialOrcamento;
      const vendedor = textoSeguro(cliente.vendedor, 50) || textoSeguro(cadastroCliente.vendedor, 50) || 'TESTE_LOCAL';
      const atendente = textoSeguro(cliente.atendente, 50) || vendedor;
      const contatoNome = textoSeguro(cadastroCliente.contato, 150);
      const contatoTelefone = textoSeguro(cadastroCliente.telefone, 50);
      const enderecoEntrega = textoSeguro([cadastroCliente.endereco, cadastroCliente.numero].filter(Boolean).join(', '), 200);
      const bairroEntrega = textoSeguro(cadastroCliente.bairro, 100);
      const cidadeEntrega = textoSeguro(cadastroCliente.cidade, 100);
      const ufEntrega = textoSeguro(cadastroCliente.uf, 2);
      const cepEntrega = textoSeguro(cadastroCliente.cep, 10);

      const cab = await t.request()
        .input('Empresa', sql.VarChar(2), '01')
        .input('Filial', sql.VarChar(2), filial)
        .input('CGC', sql.VarChar(20), cgc)
        .input('NomeCliente', sql.VarChar(150), nomeCliente)
        .input('CodVendedor_ID', sql.VarChar(50), vendedor)
        .input('VendedorExt', sql.VarChar(50), atendente)
        .input('CondPagto_ID', sql.VarChar(20), condicaoPagamentoReal.condPagtoId)
        .input('FPagto', sql.Int, formaPagamentoReal.fPagto)
        .input('CustoFinanceiro', sql.Decimal(18,6), condicaoPagamentoReal.custoFinanc)
        .input('ContatoNome', sql.VarChar(150), contatoNome)
        .input('ContatoTelefone', sql.VarChar(50), contatoTelefone)
        .input('EnderecoEntrega', sql.VarChar(200), enderecoEntrega)
        .input('BairroEntrega', sql.VarChar(100), bairroEntrega)
        .input('CidadeEntrega', sql.VarChar(100), cidadeEntrega)
        .input('UFEntrega', sql.VarChar(2), ufEntrega)
        .input('CEPEntrega', sql.VarChar(10), cepEntrega)
        .input('VlrProdutos', sql.Decimal(18,2), totalLista)
        .input('VlrTotal', sql.Decimal(18,2), totalNegociado)
        .input('Status', sql.VarChar(20), 'RASC_SOLICITACAO')
        .input('UsuarioCriacao', sql.VarChar(50), 'TESTE_LOCAL')
        .input('Observacoes', sql.VarChar(sql.MAX), textoSeguro(body.observacoes, 4000))
        .query(`
          INSERT INTO dbo.Aplicativo_ComercialOrcamentoTeste
          (
            NumeroTeste, Empresa, Filial, CGC, NomeCliente,
            CodVendedor_ID, VendedorExt,
            CondPagto_ID, FPagto, CustoFinanceiro,
            ContatoNome, ContatoTelefone, EnderecoEntrega, BairroEntrega, CidadeEntrega, UFEntrega, CEPEntrega,
            VlrProdutos, VlrICMS, VlrPIS, VlrCOFINS, VlrIPI, VlrST, VlrFrete, VlrTotal,
            Status, UsuarioCriacao, Observacoes
          )
          OUTPUT INSERTED.Id
          VALUES
          (
            NULL, @Empresa, @Filial, @CGC, @NomeCliente,
            @CodVendedor_ID, @VendedorExt,
            @CondPagto_ID, @FPagto, @CustoFinanceiro,
            @ContatoNome, @ContatoTelefone, @EnderecoEntrega, @BairroEntrega, @CidadeEntrega, @UFEntrega, @CEPEntrega,
            @VlrProdutos, 0, 0, 0, 0, 0, 0, @VlrTotal,
            @Status, @UsuarioCriacao, @Observacoes
          )
        `);

      const orcamentoTesteId = Number(cab.recordset[0].Id);
      const numeroTeste = 900000000 + orcamentoTesteId;

      await t.request()
        .input('id', sql.Int, orcamentoTesteId)
        .input('numero', sql.Int, numeroTeste)
        .query(`UPDATE dbo.Aplicativo_ComercialOrcamentoTeste SET NumeroTeste=@numero WHERE Id=@id`);

      for (const item of itens) {
        await t.request()
          .input('OrcamentoTeste_ID', sql.Int, orcamentoTesteId)
          .input('NItem', sql.Int, item.NItem)
          .input('CodProduto_ID', sql.Int, item.CodProduto_ID)
          .input('CodFabricante_ID', sql.VarChar(20), item.CodFabricante_ID)
          .input('DescricaoProduto', sql.VarChar(500), textoSeguro(item.DescricaoProduto, 500))
          .input('NomeFabricante', sql.VarChar(200), textoSeguro(item.NomeFabricante, 200))
          .input('RefFabricante', sql.VarChar(150), textoSeguro(item.RefFabricante, 150))
          .input('UnidadeMedida_ID', sql.VarChar(10), textoSeguro(item.UnidadeMedida_ID, 10))
          .input('Quantidade', sql.Decimal(18,3), item.quantidade)
          .input('EmpresaEstoque', sql.VarChar(2), item.EmpresaEstoque)
          .input('FilialEstoque', sql.VarChar(2), item.FilialEstoque)
          .input('EstoqueFisico', sql.Decimal(18,3), item.EstoqueFisico)
          .input('EstoqueLiquido', sql.Decimal(18,3), item.EstoqueLiquido)
          .input('PrecoLista', sql.Decimal(18,6), item.PrecoBaseDeak)
          .input('PrecoUnitario', sql.Decimal(18,6), item.precoReferencia)
          .input('PrecoNegociado', sql.Decimal(18,6), item.precoNegociado)
          .input('PrecoTotal', sql.Decimal(18,2), item.totalLista)
          .input('PrecoDesconto', sql.Decimal(18,2), item.totalNegociado)
          .input('PorcDesconto', sql.Decimal(18,6), item.descontoPercentual ? -Math.abs(item.descontoPercentual) : 0)
          .input('PrecoCustoOri', sql.Decimal(18,6), item.PrecoCustoOri)
          .input('PrecoCusto', sql.Decimal(18,6), item.PrecoCustoPersistir)
          .input('Margem', sql.Decimal(18,6), item.MargemPersistir)
          .input('Observacao', sql.VarChar(sql.MAX),
            `S2.1.3: apresentação ${item.TipoApresentacao}; solicitado cliente ${item.QuantidadeSolicitadaCliente}; ` +
            `quantidade confirmada ${item.QuantidadeComercial}; referência apresentação ${item.FatorConversaoVenda}; quantidade Deak ${item.quantidade} ${item.UnidadeMedida_ID || ''}. ` +
            `S2.1: ${item.ListaPrecoS21}; preço base ${item.PrecoBaseDeak}; custo base ${item.PrecoCustoOri}; ` +
            `custo financeiro ${condicaoPagamentoReal.custoFinanc}%; motor ${item.PrecoMotorS21}; ` +
            `preço confirmado ${item.precoReferencia}; diferença ${item.DiferencaPrecoMotor}. ` +
            `${item.PrecoMotorFoiUsado ? 'Preço do motor aplicado.' : 'Preço manual/desconto: PrecoCusto e Margem não persistidos para não afirmar cálculo ainda não homologado.'} Motor ainda em homologação, sem generalização fiscal/partilha.`)
          .query(`
            INSERT INTO dbo.Aplicativo_ComercialOrcamentoItemTeste
            (
              OrcamentoTeste_ID, NItem, CodProduto_ID, CodFabricante_ID,
              DescricaoProduto, NomeFabricante, RefFabricante,
              UnidadeMedida_ID, Quantidade,
              EmpresaEstoque, FilialEstoque, EstoqueFisico, EstoqueLiquido,
              PrecoLista, PrecoUnitario, PrecoNegociado,
              PrecoTotal, PrecoDesconto, PorcDesconto,
              PrecoCustoOri, PrecoCusto, Margem,
              Observacao
            )
            VALUES
            (
              @OrcamentoTeste_ID, @NItem, @CodProduto_ID, @CodFabricante_ID,
              @DescricaoProduto, @NomeFabricante, @RefFabricante,
              @UnidadeMedida_ID, @Quantidade,
              @EmpresaEstoque, @FilialEstoque, @EstoqueFisico, @EstoqueLiquido,
              @PrecoLista, @PrecoUnitario, @PrecoNegociado,
              @PrecoTotal, @PrecoDesconto, @PorcDesconto,
              @PrecoCustoOri, @PrecoCusto, @Margem,
              @Observacao
            )
          `);
      }

      await t.request()
        .input('OrcamentoTeste_ID', sql.Int, orcamentoTesteId)
        .input('Acao', sql.VarChar(50), 'CRIAR_RASC_SOLICITACAO')
        .input('Usuario', sql.VarChar(50), 'TESTE_LOCAL')
        .input('Descricao', sql.VarChar(sql.MAX), `Rascunho ${numeroTeste} criado a partir de solicitação importada.`)
        .input('DadosJson', sql.VarChar(sql.MAX), JSON.stringify({
          numeroTeste,
          itens: itens.length,
          totalLista,
          totalNegociado,
          cliente: {
            cgc, nomeCliente, fantasia: cadastroCliente.fantasia, vendedor, atendente,
            enderecoEntrega, bairroEntrega, cidadeEntrega, ufEntrega, cepEntrega
          },
          pagamento: {
            condPagtoId: condicaoPagamentoReal.condPagtoId,
            condicao: condicaoPagamentoReal.descricao,
            custoFinanc: condicaoPagamentoReal.custoFinanc,
            parcelasDias: condicaoPagamentoReal.parcelasDias,
            fPagto: formaPagamentoReal.fPagto,
            forma: formaPagamentoReal.descricao
          },
          motorPrecoS21: {
            escopo: 'SEM_PARTILHA_EM_HOMOLOGACAO',
            filialOrcamento,
            custoFinanc: condicaoPagamentoReal.custoFinanc,
            itens: itens.map(i => ({
              nItem: i.NItem,
              produto: i.CodProduto_ID,
              fabricante: i.CodFabricante_ID,
              apresentacao: i.TipoApresentacao,
              unidadeVenda: i.UnidadeMedida_ID,
              quantidadeSolicitadaCliente: i.QuantidadeSolicitadaCliente,
              quantidadeComercial: i.QuantidadeComercial,
              fatorConversao: i.FatorConversaoVenda,
              quantidadeDeak: i.quantidade,
              empresaPreco: i.EmpresaPreco,
              filialPreco: i.FilialPreco,
              lista: i.ListaPrecoS21,
              precoBase: i.PrecoBaseDeak,
              custoBase: i.PrecoCustoOri,
              margemBase: i.MargemBaseDeak,
              cargaBasePercentual: i.CargaBasePercentual,
              precoMotor: i.PrecoMotorS21,
              custoApurado: i.PrecoCustoApuradoS21,
              precoConfirmado: i.precoReferencia,
              diferenca: i.DiferencaPrecoMotor,
              motorAplicadoSemDesconto: i.PrecoMotorFoiUsado
            }))
          },
          origensEstoque: itens.map(i => ({
            nItem: i.NItem,
            produto: i.CodProduto_ID,
            fabricante: i.CodFabricante_ID,
            empresa: i.EmpresaEstoque,
            filial: i.FilialEstoque,
            estoqueLiquido: i.EstoqueLiquido,
            quantidade: i.quantidade,
            unidadeVenda: i.UnidadeMedida_ID,
            quantidadeComercial: i.QuantidadeComercial,
            apresentacao: i.TipoApresentacao
          }))
        }))
        .query(`
          INSERT INTO dbo.Aplicativo_ComercialOrcamentoLogTeste
            (OrcamentoTeste_ID, Acao, Usuario, Descricao, DadosJson)
          VALUES
            (@OrcamentoTeste_ID, @Acao, @Usuario, @Descricao, @DadosJson)
        `);

      await t.commit();
      res.status(201).json({
        ok: true,
        numeroTeste,
        orcamentoTesteId,
        itens: itens.length,
        totalLista,
        totalNegociado,
        pagamento: {
          condPagtoId: condicaoPagamentoReal.condPagtoId,
          condicao: condicaoPagamentoReal.descricao,
          custoFinanc: condicaoPagamentoReal.custoFinanc,
          fPagto: formaPagamentoReal.fPagto,
          forma: formaPagamentoReal.descricao
        },
        mensagem: `Orçamento TESTE ${numeroTeste} criado com sucesso.`
      });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (err) { next(err); }
});
// ===== fim S1.3 =====

// ===== fim S1 =====


app.get('/solicitacao', (req, res) => res.sendFile(path.join(__dirname, 'public', 'solicitacao.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error('[ERRO]', err);
  res.status(err.status || 500).json({ erro: err.message || 'Erro interno.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Vanguard Comercial - teste local: http://localhost:${PORT}`);
  console.log('🧪 Somente tabelas TESTE recebem gravação nesta versão.');
  console.log('🔎 Views do Deak são usadas somente para leitura.');
});
