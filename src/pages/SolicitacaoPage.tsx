import { useEffect } from 'react';
import { CabecalhoComercial } from '../components/comercial/CabecalhoComercial';
import { EntradaSolicitacao } from '../components/comercial/EntradaSolicitacao';
import { conteudoSolicitacao } from '../legacy/conteudoSolicitacao';
import { initSolicitacao } from '../legacy/solicitacao';
import { solicitacaoStyles } from '../styles/solicitacaoStyles';

/**
 * A migração da tela é progressiva: cabeçalho e entrada são JSX real,
 * enquanto as seções 2–6 continuam com seus IDs e manipuladores homologados.
 * Nenhuma regra de preço, alçada ou gravação SQL é modificada aqui.
 */
export function SolicitacaoPage() {
  useEffect(() => {
    document.title = 'Vanguard One · S2.2A · Alçada comercial diagnóstica';
    initSolicitacao();
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: solicitacaoStyles }} />
      <div className="wrap">
        <CabecalhoComercial />
        <EntradaSolicitacao />
        <div id="resultado" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: conteudoSolicitacao }} />
      </div>
    </>
  );
}
