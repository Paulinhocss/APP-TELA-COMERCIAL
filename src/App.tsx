import { HomologacaoPage } from './pages/HomologacaoPage';
import { SolicitacaoPage } from './pages/SolicitacaoPage';

export function App() {
  const rota = window.location.pathname.replace(/\/+$/, '') || '/';
  if (rota === '/solicitacao') return <SolicitacaoPage />;
  return <HomologacaoPage />;
}
