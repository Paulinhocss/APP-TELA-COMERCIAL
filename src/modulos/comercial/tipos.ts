export interface ProdutoSugerido {
  CodProduto_ID: number;
  DescricaoProduto: string;
  elegivelAuto?: boolean;
  bitolaCompativel?: boolean;
  corCompativel?: boolean;
  score?: number;
}

export interface FilialEstoque {
  Empresa: string;
  Filial: string;
  EstoqueFisico: number;
  SaldoVNDS: number;
  SaldoEXPE: number;
  EstoqueLiquido: number;
}

export interface ApresentacaoProduto {
  tipo: string;
  unidadeMedida: string | null;
  unidadeVenda: string | null;
  qtdeUnidade: number;
  qtMinVenda: number;
  qtMinVendaMultiplo: number;
  fatorConversao: number;
  multiploVenda: number;
}

export interface PrecoAtualBase {
  lista: string;
  precoBase: number | null;
  margemBase: number | null;
  custoBase: number | null;
  filialOrcamento: string;
}

export interface Fabricante {
  CodFabricante_ID: string;
  NomeFabricante?: string;
  estoqueLiquidoTotal?: number;
  estoqueFisicoTotal?: number;
  filiais?: FilialEstoque[];
  apresentacao?: ApresentacaoProduto;
  precoAtualBase?: PrecoAtualBase | null;
}

export interface LinhaComercial extends LinhaSolicitacao {
  fornecedorSelecionado: string | null;
  filialEstoqueSelecionada: string | null;
  quantidadeSolicitada: number;
  quantidadeComercial: number | null;
  consultandoFornecedores: boolean;
  erroFornecedores: string | null;
}

export interface LinhaSolicitacao {
  id: number | string;
  categoria?: string;
  bitola?: number;
  cor?: string;
  quantidade: number;
  sugestoes: ProdutoSugerido[];
  produtoSelecionado: ProdutoSugerido | null;
  fornecedores: Fabricante[];
}

export interface AnaliseSolicitacao {
  resumo: { linhasIdentificadas: number; quantidadeTotal: number };
  itens: LinhaSolicitacao[];
}

export type IdEtapa = "solicitacao" | "catalogo" | "estoque" | "editor" | "grade" | "cliente" | "pagamento" | "revisao";

export interface Etapa {
  id: IdEtapa;
  nome: string;
  objetivo: string;
}

export const etapas: Etapa[] = [
  { id: "solicitacao", nome: "Solicitação", objetivo: "Receber a necessidade e identificar os itens" },
  { id: "catalogo", nome: "Produtos", objetivo: "Confirmar produto, fabricante e apresentação" },
  { id: "estoque", nome: "Estoque", objetivo: "Confirmar saldo e filial de origem" },
  { id: "editor", nome: "Editor comercial", objetivo: "Quantidade, preço, desconto, margem e alçada" },
  { id: "grade", nome: "Grade do orçamento", objetivo: "Conferir itens, ordem e totais" },
  { id: "cliente", nome: "Cliente Deak", objetivo: "Cadastro real, vendedor e informações de crédito" },
  { id: "pagamento", nome: "Pagamento", objetivo: "Condição, forma, parcelas e custo financeiro" },
  { id: "revisao", nome: "Revisão", objetivo: "Tributação, validações e gravação somente em TESTE" },
];
