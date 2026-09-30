import type { ApresentacaoProduto, Fabricante, FilialEstoque, LinhaComercial, LinhaSolicitacao } from "./tipos";

export const numeroComercial = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);

export const moedaComercial = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export function prepararLinhas(itens: LinhaSolicitacao[]): LinhaComercial[] {
  return itens.map(item => ({
    ...item,
    quantidadeSolicitada: Number(item.quantidade || 0),
    quantidadeComercial: Number(item.quantidade || 0),
    fornecedorSelecionado: null,
    filialEstoqueSelecionada: null,
    consultandoFornecedores: false,
    erroFornecedores: null
  }));
}

export function obterFabricante(item: LinhaComercial): Fabricante | null {
  return item.fornecedores.find(f => String(f.CodFabricante_ID) === String(item.fornecedorSelecionado)) || null;
}

export function obterFilial(item: LinhaComercial): FilialEstoque | null {
  return obterFabricante(item)?.filiais?.find(f => `${f.Empresa}:${f.Filial}` === String(item.filialEstoqueSelecionada)) || null;
}

export function quantidadeInicial(item: LinhaComercial, apresentacao: ApresentacaoProduto | undefined): number | null {
  if (!apresentacao) return item.quantidadeSolicitada;
  const tipo = String(apresentacao.tipo || "UNIDADE").toUpperCase();
  if (tipo === "ROLO_FIXO") return Number((item.quantidadeSolicitada * (Number(apresentacao.fatorConversao) || 1)).toFixed(6));
  if (tipo === "BOBINA_CORTE" || tipo === "CARRETEL_CORTE") return null;
  return item.quantidadeSolicitada;
}

export function validarQuantidade(item: LinhaComercial): { valido: boolean; mensagem: string } {
  const apresentacao = obterFabricante(item)?.apresentacao;
  if (!apresentacao) return { valido: false, mensagem: "Apresentação não localizada no Deak." };
  const qtd = Number(item.quantidadeComercial || 0);
  const unidade = apresentacao.unidadeVenda || apresentacao.unidadeMedida || "un.";
  if (!Number.isFinite(qtd) || qtd <= 0) return { valido: false, mensagem: "Informe a quantidade comercial." };
  const minimo = Number(apresentacao.qtMinVenda || 0);
  if (minimo > 0 && qtd + 0.000001 < minimo) return { valido: false, mensagem: `Quantidade mínima: ${numeroComercial(minimo)} ${unidade}.` };
  const exigeMultiplo = Number(apresentacao.qtMinVendaMultiplo || 0) === 1;
  const multiplo = Number(apresentacao.multiploVenda || minimo || 0);
  if (exigeMultiplo && multiplo > 0 && Math.abs(qtd / multiplo - Math.round(qtd / multiplo)) > 0.000001) {
    return { valido: false, mensagem: `A quantidade deve ser múltipla de ${numeroComercial(multiplo)} ${unidade}.` };
  }
  return { valido: true, mensagem: "Quantidade compatível com a apresentação cadastrada." };
}

export function situacaoEstoque(item: LinhaComercial): { valido: boolean; mensagem: string } {
  const quantidade = validarQuantidade(item);
  if (!quantidade.valido) return quantidade;
  const filial = obterFilial(item);
  if (!filial) return { valido: false, mensagem: "Escolha a filial de origem do estoque." };
  const liquido = Number(filial.EstoqueLiquido || 0);
  if (liquido < Number(item.quantidadeComercial || 0)) {
    return { valido: false, mensagem: `Saldo insuficiente: ${numeroComercial(liquido)} disponíveis.` };
  }
  return { valido: true, mensagem: "Estoque conferido para a quantidade informada." };
}
