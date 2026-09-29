# MIGRACAO REACT + TYPESCRIPT

Data: 29/09/2026

A base anterior em HTML/JavaScript foi preservada no historico Git e na branch:

backup/pre-react-typescript

## Estrutura nova

- index.html: entrada do Vite
- src/main.tsx: bootstrap React
- src/App.tsx: roteamento simples da homologacao
- src/pages: paginas React
- src/legacy: adaptadores TypeScript para a logica ja homologada
- src/server/server.ts: API Express/SQL Server em TypeScript
- vite.config.ts: Vite com proxy de /api para a porta 3010

## Diretriz daqui em diante

Nao criar novas regras em HTML com script inline.
Toda funcionalidade nova deve nascer em React + TypeScript.
Quando uma area existente for alterada, migrar aquele bloco do adaptador legado para componente/hook tipado sempre que for seguro.
