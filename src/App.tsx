import { HomologacaoPage } from './pages/HomologacaoPage';
import { SolicitacaoPage } from './pages/SolicitacaoPage';
import { PaginaEstruturaComercial } from './modulos/comercial/PaginaEstruturaComercial';

export function App() {
  const rota = window.location.pathname.replace(/\/+$/, '') || '/';
  if (rota === '/estrutura') return <PaginaEstruturaComercial />;
  if (rota === '/solicitacao') return <SolicitacaoPage />;
  return <HomologacaoPage />;
}
