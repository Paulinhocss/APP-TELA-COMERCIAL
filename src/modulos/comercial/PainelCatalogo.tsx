import type { LinhaComercial } from "./tipos";
import { moedaComercial, numeroComercial, obterFabricante, obterFilial, situacaoEstoque, validarQuantidade } from "./catalogo";

interface PropriedadesCatalogo {
  itens: LinhaComercial[];
  onEscolherProduto: (id: string, produto: string) => void;
  onEscolherFabricante: (id: string, fabricante: string) => void;
  onAlterarQuantidade: (id: string, quantidade: number | null) => void;
}

interface PropriedadesEstoque {
  itens: LinhaComercial[];
  onEscolherFilial: (id: string, filial: string) => void;
  onVoltarProdutos: () => void;
}

const rotulo = (item: LinhaComercial) =>
  [item.categoria, item.bitola ? `${item.bitola} mm` : "", item.cor].filter(Boolean).join(" · ") || "Item solicitado";

export function PainelCatalogo({ itens, onEscolherProduto, onEscolherFabricante, onAlterarQuantidade }: PropriedadesCatalogo) {
  const escolhidos = itens.filter(item => Boolean(item.fornecedorSelecionado)).length;
  return (
    <div className="ec-catalogo">
      <div className="ec-indicadores">
        <div><small>Linhas solicitadas</small><strong>{itens.length}</strong></div>
        <div><small>Fabricantes escolhidos</small><strong>{escolhidos}/{itens.length}</strong></div>
        <div><small>Produtos para conferir</small><strong>{itens.filter(item => !item.produtoSelecionado).length}</strong></div>
      </div>
      <p className="ec-descricao">
        Produto sugerido pela pesquisa real do Deak. Confirme o produto e depois selecione um fabricante.
        O preço exibido é a referência atual da lista, não o preço final negociado.
      </p>
      <div className="ec-catalogo-lista">
        {itens.map((item, indice) => {
          const id = String(item.id);
          const fabricante = obterFabricante(item);
          const apresentacao = fabricante?.apresentacao;
          const validacao = fabricante ? validarQuantidade(item) : null;
          return (
            <article className="ec-produto" key={id + "-" + indice}>
              <div className="ec-produto-cabecalho">
                <div><small>Linha {indice + 1} · Solicitado</small><h3>{rotulo(item)}</h3><span>{numeroComercial(item.quantidadeSolicitada)} unidade(s) na solicitação original</span></div>
                <span className="ec-chip">{fabricante ? "Fabricante escolhido" : "Pendente"}</span>
              </div>
              <label className="ec-rotulo" htmlFor={`ec-produto-${indice}`}>Produto do Deak</label>
              <select id={`ec-produto-${indice}`} className="ec-seletor"
                value={item.produtoSelecionado ? String(item.produtoSelecionado.CodProduto_ID) : ""}
                onChange={e => onEscolherProduto(id, e.target.value)}>
                <option value="">Selecione o produto...</option>
                {item.sugestoes.map(sug => (
                  <option key={sug.CodProduto_ID} value={String(sug.CodProduto_ID)}>
                    {sug.CodProduto_ID} — {sug.DescricaoProduto}
                  </option>
                ))}
              </select>
              {item.consultandoFornecedores && <p className="ec-aviso">Consultando os fabricantes do produto...</p>}
              {item.erroFornecedores && <p role="alert" className="ec-erro">{item.erroFornecedores}</p>}
              {item.produtoSelecionado && !item.consultandoFornecedores && (
                <>
                  <label className="ec-rotulo">Fabricantes disponíveis</label>
                  <div className="ec-fabricantes">
                    {item.fornecedores.map(f => {
                      const marcado = f.CodFabricante_ID === item.fornecedorSelecionado;
                      const preco = f.precoAtualBase?.precoBase;
                      return (
                        <button key={f.CodFabricante_ID} type="button"
                          aria-pressed={marcado} className={"ec-fabricante" + (marcado ? " ativo" : "")}
                          onClick={() => onEscolherFabricante(id, f.CodFabricante_ID)}>
                          <strong>{f.NomeFabricante || f.CodFabricante_ID}</strong>
                          <small>Saldo líquido total: {numeroComercial(Number(f.estoqueLiquidoTotal || 0))}</small>
                          <small>{preco && preco > 0 ? `${f.precoAtualBase?.lista || "LP1"}: ${moedaComercial(preco)} / ${f.apresentacao?.unidadeVenda || "un."}` : "Preço base a consultar"}</small>
                        </button>
                      );
                    })}
                    {item.fornecedores.length === 0 && <p className="ec-aviso">Nenhum fabricante encontrado para este produto.</p>}
                  </div>
                </>
              )}
              {fabricante && (
                <div className="ec-apresentacao">
                  <div><small>Apresentação de venda</small><strong>{apresentacao?.tipo || "Não identificada"}</strong></div>
                  <div><small>Unidade comercial</small><strong>{apresentacao?.unidadeVenda || apresentacao?.unidadeMedida || "—"}</strong></div>
                  <div><small>Mínimo cadastrado</small><strong>{numeroComercial(Number(apresentacao?.qtMinVenda || 0))}</strong></div>
                  <div>
                    <label htmlFor={`ec-quantidade-${indice}`}>Quantidade comercial</label>
                    <input id={`ec-quantidade-${indice}`} type="number" min="0" step="any" value={item.quantidadeComercial ?? ""}
                      onChange={e => onAlterarQuantidade(id, e.target.value.trim() === "" ? null : Number(e.target.value))} />
                  </div>
                  <p className={validacao?.valido ? "ec-validacao ok" : "ec-validacao"}>
                    {validacao?.mensagem}
                    {apresentacao?.tipo === "ROLO_FIXO" && " · Para ROLO FIXO, a quantidade comercial é em unidade base (ex.: MT)."}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function PainelEstoque({ itens, onEscolherFilial, onVoltarProdutos }: PropriedadesEstoque) {
  const conferidos = itens.filter(i => situacaoEstoque(i).valido).length;
  return (
    <div className="ec-catalogo">
      <div className="ec-indicadores">
        <div><small>Itens solicitados</small><strong>{itens.length}</strong></div>
        <div><small>Com origem conferida</small><strong>{conferidos}</strong></div>
        <div><small>Ainda pendentes</small><strong>{itens.length - conferidos}</strong></div>
      </div>
      <p className="ec-descricao">Conferência de estoque somente para leitura. As filiais abaixo vêm das views do Deak. Nenhuma reserva ou movimentação é feita nesta etapa.</p>
      <div className="ec-catalogo-lista">
        {itens.map((item, indice) => {
          const id = String(item.id);
          const fabricante = obterFabricante(item);
          const filial = obterFilial(item);
          const situacao = situacaoEstoque(item);
          return (
            <article key={id + "-" + indice} className="ec-produto">
              <div className="ec-produto-cabecalho">
                <div><small>Linha {indice + 1}</small><h3>{rotulo(item)}</h3><span>{fabricante?.NomeFabricante || "Fabricante não escolhido"} · {numeroComercial(Number(item.quantidadeComercial || 0))} {fabricante?.apresentacao?.unidadeVenda || ""}</span></div>
                <span className={"ec-chip" + (situacao.valido ? " conferido" : "")}>{situacao.valido ? "Conferido" : "Pendente"}</span>
              </div>
              {!fabricante ? (
                <button type="button" className="ec-acao-secundaria" onClick={onVoltarProdutos}>Escolher fabricante no catálogo</button>
              ) : (
                <>
                  <label className="ec-rotulo">Selecione a filial de origem</label>
                  <div className="ec-filiais">
                    {(fabricante.filiais || []).map(f => {
                      const marcado = String(f.Filial) === String(item.filialEstoqueSelecionada);
                      return (
                        <button type="button" key={`${f.Empresa}-${f.Filial}`}
                          onClick={() => onEscolherFilial(id, String(f.Filial))}
                          aria-pressed={marcado} className={"ec-filial" + (marcado ? " ativo" : "")}>
                          <strong>Filial {f.Filial} {marcado ? " · selecionada" : ""}</strong>
                          <small>Físico: {numeroComercial(Number(f.EstoqueFisico || 0))}</small>
                          <small>VNDS: {numeroComercial(Number(f.SaldoVNDS || 0))} · EXPE: {numeroComercial(Number(f.SaldoEXPE || 0))}</small>
                          <strong>Líquido: {numeroComercial(Number(f.EstoqueLiquido || 0))}</strong>
                        </button>
                      );
                    })}
                    {!fabricante.filiais?.length && <p className="ec-aviso">Não há saldos por filial disponíveis na consulta.</p>}
                  </div>
                  {filial && <p className="ec-aviso">Origem selecionada: {filial.Empresa}/{filial.Filial}. Não houve baixa de estoque.</p>}
                </>
              )}
              <p className={"ec-validacao" + (situacao.valido ? " ok" : "")}>{situacao.mensagem}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
