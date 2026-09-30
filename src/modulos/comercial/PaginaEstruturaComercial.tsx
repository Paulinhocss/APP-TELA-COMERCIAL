import { useState, type FormEvent } from "react";
import { apiComercial } from "./api";
import { etapas, type AnaliseSolicitacao, type IdEtapa } from "./tipos";
import "./estrutura.css";

const numero = (valor: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);

export function PaginaEstruturaComercial() {
  const [etapa, definirEtapa] = useState<IdEtapa>("solicitacao");
  const [texto, definirTexto] = useState("");
  const [filial, definirFilial] = useState("01");
  const [analise, definirAnalise] = useState<AnaliseSolicitacao | null>(null);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState("");
  const atual = etapas.find(item => item.id === etapa)!;

  async function analisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!texto.trim() || carregando) return;
    definirErro("");
    definirCarregando(true);
    try {
      const resultado = await apiComercial.analisarSolicitacao(texto, filial);
      definirAnalise(resultado);
      definirEtapa("catalogo");
    } catch (causa) {
      definirErro(causa instanceof Error ? causa.message : "Não foi possível interpretar a solicitação.");
    } finally {
      definirCarregando(false);
    }
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
                      onChange={e => definirFilial(e.target.value)} /></div>
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
                <div>
                  <div className="ec-indicadores">
                    <div><small>Linhas identificadas</small><strong>{analise.resumo.linhasIdentificadas}</strong></div>
                    <div><small>Quantidade solicitada</small><strong>{numero(analise.resumo.quantidadeTotal)}</strong></div>
                    <div><small>Sugestão automática</small><strong>{analise.itens.filter(i => i.produtoSelecionado).length}</strong></div>
                  </div>
                  <p className="ec-descricao">
                    Dados reais da consulta. A seleção definitiva dos produtos será migrada
                    para componentes React controlados, sem substituir as regras homologadas.
                  </p>
                  <div className="ec-lista">
                    {analise.itens.map((item, i) => (
                      <article key={String(item.id) + "-" + String(i)}>
                        <div><span>{i + 1}</span><strong>{[item.categoria, item.bitola ? String(item.bitola) + " mm" : "", item.cor].filter(Boolean).join(" · ") || "Item solicitado"}</strong><small>{numero(Number(item.quantidade || 0))} solicitado(s)</small></div>
                        <div>
                          {item.produtoSelecionado
                            ? <><strong>{item.produtoSelecionado.CodProduto_ID} — {item.produtoSelecionado.DescricaoProduto}</strong><small>{(item.fornecedores || []).length} fabricante(s) identificado(s)</small></>
                            : <small>Produto pendente de conferência</small>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ec-pendente"><p>Primeiro interprete uma solicitação.</p><button type="button" onClick={() => definirEtapa("solicitacao")}>Ir para solicitação</button></div>
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
            <div><dt>Solicitação</dt><dd>{analise ? String(analise.itens.length) + " linhas" : "Aguardando"}</dd></div>
            <div><dt>Banco</dt><dd>Deak (leitura via API)</dd></div>
            <div><dt>Gravação</dt><dd>Desativada nesta estrutura</dd></div>
          </dl>
          <p>Esta página é a nova estrutura em evolução e não substitui a homologação existente.</p>
        </aside>
      </div>
    </div>
  );
}
