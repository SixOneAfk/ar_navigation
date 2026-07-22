import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
export default defineConfig({
    plugins: [react(), basicSsl()],
    server: {
        https: {},
        host: true,
        port: 5173,
        allowedHosts: true,
        hmr: {
            protocol: 'wss',
            clientPort: 443,
        },
    },
});
