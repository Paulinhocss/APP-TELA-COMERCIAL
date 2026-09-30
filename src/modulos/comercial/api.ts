import type { AnaliseSolicitacao } from "./tipos";

export class ErroComercial extends Error {
  constructor(mensagem: string, readonly status: number) {
    super(mensagem);
    this.name = "ErroComercial";
  }
}

async function consultar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...opcoes.headers }
  });
  const resultado: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" && "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Erro ao consultar o serviço comercial.";
    throw new ErroComercial(mensagem, resposta.status);
  }
  return resultado as T;
}

export const apiComercial = {
  analisarSolicitacao(texto: string, filial: string): Promise<AnaliseSolicitacao> {
    return consultar("/api/solicitacao/analisar", {
      method: "POST",
      body: JSON.stringify({ texto, filial })
    });
  }
};
