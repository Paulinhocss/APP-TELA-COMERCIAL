/** Primeiro componente React da solicitação; preserva os IDs usados pelo motor homologado. */
const exemploSolicitacao = "Fios\n\n2,5 mm\n\n* Branco — 8 un.\n* Preto — 8 un.\n* Vermelho — 8 un.\n* Amarelo — 5 un.\n* Azul — 5 un.\n* Verde — 6 un.\n\n4 mm\n\n* Preto — 3 un.\n* Vermelho — 3 un.\n* Branco — 3 un.\n* Verde — 2 un.\n\n6 mm\n\n* Branco — 2 un.\n* Preto — 2 un.\n* Vermelho — 2 un.\n\nTotal\n\n* 2,5 m: 40 un.\n* 4 m: 11 un.\n* 6 m: 6 un.\n* Total geral: 57 unidades";

// Ponte temporária: a análise comercial continua no adaptador S2.2A já homologado.
function analisarPeloLegado() {
  const analisar = (window as Window & { analisar?: () => Promise<void> }).analisar;
  if (typeof analisar === 'function') void analisar();
}

export function EntradaSolicitacao() {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>1. Cole a solicitação recebida</h2>
        <span className="hint">WhatsApp, e-mail ou texto copiado</span>
      </div>
      <div className="panel-body">
        <textarea id="texto" aria-label="Solicitação recebida" defaultValue={exemploSolicitacao} />
        <div className="actions">
          <button className="btn primary" id="btnAnalisar" type="button" onClick={analisarPeloLegado}>
            Interpretar e localizar produtos
          </button>
          <div id="msg" className="msg" role="status" aria-live="polite" />
        </div>
      </div>
    </section>
  );
}
