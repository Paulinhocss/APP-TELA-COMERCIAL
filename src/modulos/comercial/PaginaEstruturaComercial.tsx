import { useRef, useState, type FormEvent } from "react";
import { apiComercial } from "./api";
import { etapas, type AnaliseSolicitacao, type IdEtapa, type LinhaComercial } from "./tipos";
import { PainelCatalogo, PainelEstoque } from "./PainelCatalogo";
import { prepararLinhas, quantidadeInicial, situacaoEstoque } from "./catalogo";
import "./estrutura.css";

const numero = (valor: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);

export function PaginaEstruturaComercial() {
  const [etapa, definirEtapa] = useState<IdEtapa>("solicitacao");
  const [texto, definirTexto] = useState("");
  const [filial, definirFilial] = useState("01");
  const [analise, definirAnalise] = useState<AnaliseSolicitacao | null>(null);
  const [linhas, definirLinhas] = useState<LinhaComercial[]>([]);
  const versaoAnalise = useRef(0);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState("");
  const atual = etapas.find(item => item.id === etapa)!;

  async function analisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!texto.trim() || carregando) return;
    definirErro("");
    definirCarregando(true);
    const versao = ++versaoAnalise.current;
    try {
      const resultado = await apiComercial.analisarSolicitacao(texto, filial);
      if (versao !== versaoAnalise.current) return;
      definirAnalise(resultado);
      definirLinhas(prepararLinhas(resultado.itens));
      definirEtapa("catalogo");
    } catch (causa) {
      if (versao === versaoAnalise.current) {
        definirErro(causa instanceof Error ? causa.message : "Não foi possível interpretar a solicitação.");
      }
    } finally {
      if (versao === versaoAnalise.current) definirCarregando(false);
    }
  }

  function escolherProduto(id: string, codigo: string) {
    const produto = Number(codigo);
    definirLinhas(atuais => atuais.map(item => {
      if (String(item.id) !== id) return item;
      const sugestao = item.sugestoes.find(s => s.CodProduto_ID === produto) || null;
      return {
        ...item, produtoSelecionado: sugestao, fornecedores: [],
        fornecedorSelecionado: null, filialEstoqueSelecionada: null,
        quantidadeComercial: item.quantidadeSolicitada,
        consultandoFornecedores: Boolean(sugestao), erroFornecedores: null
      };
    }));
    if (!codigo) return;
    const versao = versaoAnalise.current;
    void apiComercial.consultarFabricantes(produto, filial)
      .then(({ fornecedores }) => {
        if (versao !== versaoAnalise.current) return;
        definirLinhas(atuais => atuais.map(item =>
          String(item.id) === id && item.produtoSelecionado?.CodProduto_ID === produto
            ? { ...item, fornecedores, consultandoFornecedores: false } : item
        ));
      })
      .catch(causa => {
        if (versao !== versaoAnalise.current) return;
        definirLinhas(atuais => atuais.map(item =>
          String(item.id) === id && item.produtoSelecionado?.CodProduto_ID === produto
            ? { ...item, consultandoFornecedores: false,
                erroFornecedores: causa instanceof Error ? causa.message : "Falha ao consultar fabricantes." } : item
        ));
      });
  }

  function escolherFabricante(id: string, codigo: string) {
    definirLinhas(atuais => atuais.map(item => {
      if (String(item.id) !== id) return item;
      const fabricante = item.fornecedores.find(f => f.CodFabricante_ID === codigo);
      if (!fabricante) return item;
      return { ...item, fornecedorSelecionado: codigo, filialEstoqueSelecionada: null,
        quantidadeComercial: quantidadeInicial(item, fabricante.apresentacao) };
    }));
  }

  function alterarQuantidade(id: string, quantidade: number | null) {
    definirLinhas(atuais => atuais.map(item =>
      String(item.id) === id ? { ...item, quantidadeComercial: quantidade } : item
    ));
  }

  function escolherFilial(id: string, filialEstoque: string) {
    definirLinhas(atuais => atuais.map(item =>
      String(item.id) === id && item.fornecedores.some(f =>
        f.CodFabricante_ID === item.fornecedorSelecionado &&
        f.filiais?.some(e => String(e.Filial) === filialEstoque))
        ? { ...item, filialEstoqueSelecionada: filialEstoque } : item
    ));
  }

  function alterarFilialComercial(proxima: string) {
    const novaFilial = proxima.trim().slice(0, 2);
    versaoAnalise.current += 1;
    definirFilial(novaFilial);
    definirAnalise(null);
    definirLinhas([]);
    definirCarregando(false);
    definirErro("");
    definirEtapa("solicitacao");
  }

  return (
    <div className="estrutura-comercial">
      <header className="ec-topo">
        <div><strong>TELA COMERCIAL</strong><span>Arquitetura React + TypeScript · projeto independente</span></div>
        <a href="/solicitacao">Tela atual homologada</a>
      </header>
      <div className="ec-layout">
        <aside className="ec-barra">
          <h2>Etapas do orçamento</h2>
          <nav aria-label="Jornada comercial">
            {etapas.map((item, indice) => (
              <button key={item.id} type="button"
                onClick={() => definirEtapa(item.id)}
                className={"ec-etapa" + (item.id === etapa ? " selecionada" : "")}
                aria-current={item.id === etapa ? "step" : undefined}>
                <span>{String(indice + 1).padStart(2, "0")}</span>
                <div><strong>{item.nome}</strong><small>{item.objetivo}</small></div>
              </button>
            ))}
          </nav>
        </aside>
        <main className="ec-principal">
          <div className="ec-titulo"><small>Estrutura funcional</small><h1>{atual.nome}</h1><p>{atual.objetivo}</p></div>
          <section className="ec-painel">
            {etapa === "solicitacao" ? (
              <form onSubmit={analisar} className="ec-form">
                <div className="ec-info">
                  <div><label htmlFor="ec-filial">Filial comercial</label>
                    <input id="ec-filial" value={filial} maxLength={2}
                      onChange={e => alterarFilialComercial(e.target.value)} /></div>
                  <p>Cole a solicitação recebida pelo vendedor. A interpretação usa a API existente e consulta as views do Deak.</p>
                </div>
                <label htmlFor="ec-texto">Solicitação do cliente</label>
                <textarea id="ec-texto" value={texto} rows={11}
                  onChange={e => definirTexto(e.target.value)}
                  placeholder="Ex.: Fios 2,5 mm — Branco 8 un., Preto 8 un...." />
                {erro && <div className="ec-erro" role="alert">{erro}</div>}
                <div className="ec-acoes">
                  <button type="submit" disabled={carregando || !texto.trim()}>
                    {carregando ? "Consultando..." : "Interpretar solicitação"}
                  </button>
                  <small>Apenas consulta. Nenhuma gravação é feita.</small>
                </div>
              </form>
            ) : etapa === "catalogo" ? (
              analise ? (
                <PainelCatalogo itens={linhas} onEscolherProduto={escolherProduto}
                  onEscolherFabricante={escolherFabricante} onAlterarQuantidade={alterarQuantidade} />
              ) : (
                <div className="ec-pendente"><p>Primeiro interprete uma solicitação.</p><button type="button" onClick={() => definirEtapa("solicitacao")}>Ir para solicitação</button></div>
              )
            ) : etapa === "estoque" ? (
              analise ? (
                <PainelEstoque itens={linhas} onEscolherFilial={escolherFilial}
                  onVoltarProdutos={() => definirEtapa("catalogo")} />
              ) : (
                <div className="ec-pendente"><p>Primeiro interprete uma solicitação e escolha os fabricantes.</p><button type="button" onClick={() => definirEtapa("solicitacao")}>Ir para solicitação</button></div>
              )
            ) : (
              <div className="ec-pendente">
                <span className="ec-etiqueta">Estrutura prevista</span>
                <h2>{atual.nome}</h2>
                <p>{atual.objetivo}. Este módulo será extraído do fluxo já homologado,
                  com componentes, estado e serviços próprios em TypeScript.</p>
                <p>Ainda não está implementado nesta nova interface. O fluxo existente segue disponível na tela atual.</p>
              </div>
            )}
          </section>
        </main>
        <aside className="ec-resumo">
          <h2>Contexto da operação</h2>
          <dl>
            <div><dt>Filial</dt><dd>{filial || "—"}</dd></div>
            <div><dt>Solicitação</dt><dd>{analise ? String(linhas.length) + " linhas" : "Aguardando"}</dd></div>
            <div><dt>Fabricantes escolhidos</dt><dd>{linhas.filter(i => i.fornecedorSelecionado).length}/{linhas.length}</dd></div>
            <div><dt>Estoque conferido</dt><dd>{linhas.filter(i => situacaoEstoque(i).valido).length}/{linhas.length}</dd></div>
            <div><dt>Banco</dt><dd>Deak (leitura via API)</dd></div>
            <div><dt>Gravação</dt><dd>Desativada nesta estrutura</dd></div>
          </dl>
          <p>Esta página é a nova estrutura em evolução e não substitui a homologação existente.</p>
        </aside>
      </div>
    </div>
  );
}
