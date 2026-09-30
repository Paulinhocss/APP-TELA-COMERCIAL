import { exec } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Ao iniciar o Vite no Windows, abre também a tela homologada.
 * A nova estrutura é aberta pelo recurso nativo server.open do Vite.
 * Nenhuma janela é aberta durante o build ou o typecheck.
 */
function abrirTelaHomologada(): Plugin {
  return {
    name: 'abrir-tela-homologada',
    apply: 'serve',
    configureServer(server) {
      if (process.platform !== 'win32') return;

      server.httpServer?.once('listening', () => {
        const endereco = server.httpServer?.address();
        if (!endereco || typeof endereco === 'string') return;

        const url = `http://localhost:${endereco.port}/solicitacao`;
        // Comando fixo; o único valor variável é a porta numérica do Vite.
        exec(`start "" "${url}"`, { windowsHide: true }, (erro) => {
          if (erro) server.config.logger.warn('Não foi possível abrir /solicitacao automaticamente.');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), abrirTelaHomologada()],
  server: {
    port: 5173,
    open: '/estrutura',
    proxy: { '/api': 'http://localhost:3010' },
  },
  build: { outDir: 'dist' },
});
