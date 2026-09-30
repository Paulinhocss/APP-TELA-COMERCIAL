import test from "node:test";
import assert from "node:assert/strict";
import type { ApresentacaoProduto, Fabricante, LinhaComercial } from "./tipos";
import { obterFilial, prepararLinhas, quantidadeInicial, situacaoEstoque, validarQuantidade } from "./catalogo";

const rolo: ApresentacaoProduto = {
  tipo: "ROLO_FIXO", unidadeMedida: "MT", unidadeVenda: "MT",
  qtdeUnidade: 100, qtMinVenda: 100, qtMinVendaMultiplo: 1,
  fatorConversao: 100, multiploVenda: 100
};
const fabricante: Fabricante = {
  CodFabricante_ID: "00001", NomeFabricante: "Fabricante de teste",
  apresentacao: rolo,
  filiais: [
    { Empresa: "01", Filial: "01", EstoqueFisico: 8000, SaldoVNDS: 0, SaldoEXPE: 100,
      EstoqueLiquido: 7900 },
    { Empresa: "01", Filial: "02", EstoqueFisico: 100, SaldoVNDS: 0, SaldoEXPE: 0,
      EstoqueLiquido: 100 }
  ]
};

function linhaComercial(): LinhaComercial {
  const [linha] = prepararLinhas([{
    id: 1, categoria: "Fios", bitola: 2.5, cor: "Branco", quantidade: 8,
    sugestoes: [{ CodProduto_ID: 446, DescricaoProduto: "Cabo teste" }],
    produtoSelecionado: { CodProduto_ID: 446, DescricaoProduto: "Cabo teste" },
    fornecedores: [fabricante]
  }]);
  return { ...linha, fornecedorSelecionado: "00001",
    filialEstoqueSelecionada: "01:01",
    quantidadeComercial: quantidadeInicial(linha, rolo) };
}

test("rolo fixo: oito rolos de 100 MT geram quantidade comercial 800 MT", () => {
  const linha = linhaComercial();
  assert.equal(linha.quantidadeSolicitada, 8);
  assert.equal(linha.quantidadeComercial, 800);
  assert.equal(validarQuantidade(linha).valido, true);
});

test("quantidade inferior ao mínimo do Deak fica pendente", () => {
  const linha = { ...linhaComercial(), quantidadeComercial: 51 };
  assert.equal(validarQuantidade(linha).valido, false);
  assert.match(validarQuantidade(linha).mensagem, /mínima/);
});

test("quantidade fora do múltiplo de rolo fica pendente", () => {
  const linha = { ...linhaComercial(), quantidadeComercial: 150 };
  assert.equal(validarQuantidade(linha).valido, false);
  assert.match(validarQuantidade(linha).mensagem, /múltipla/);
});

test("saldo da filial considera o líquido, não apenas o físico", () => {
  const linha = linhaComercial();
  assert.equal(obterFilial(linha)?.EstoqueFisico, 8000);
  assert.equal(obterFilial(linha)?.EstoqueLiquido, 7900);
  assert.equal(situacaoEstoque(linha).valido, true);
  assert.equal(situacaoEstoque({ ...linha, quantidadeComercial: 8000 }).valido, false);
});

test("filial insuficiente não pode ser marcada como conferida", () => {
  const linha = { ...linhaComercial(), filialEstoqueSelecionada: "01:02" };
  assert.equal(situacaoEstoque(linha).valido, false);
});

test("bobina de corte exige metragem informada manualmente", () => {
  const linha = linhaComercial();
  const apresentacao: ApresentacaoProduto = { ...rolo, tipo: "BOBINA_CORTE", qtMinVenda: 0, qtMinVendaMultiplo: 0 };
  assert.equal(quantidadeInicial(linha, apresentacao), null);
});
