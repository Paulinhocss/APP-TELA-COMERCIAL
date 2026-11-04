/** Cabeçalho da tela comercial, sem dependências do adaptador legado. */
export function CabecalhoComercial() {
  return (
    <header className="head">
      <div>
        <div className="brand">VANGUARD <span>ONE</span></div>
        <div className="subtitle">Comercial · Solicitação → produto → fabricante → estoque → cliente → pagamento → orçamento TESTE</div>
      </div>
      <nav className="nav" aria-label="Navegação comercial">
        <a className="btn" href="/">Homologação Deak × TESTE</a>
      </nav>
    </header>
  );
}
