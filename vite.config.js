import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
var config = {
    plugins: [
        react(),
        basicSsl()
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        https: true,
        allowedHosts: ['localhost', '127.0.0.1', '192.168.1.100']
    },
};
export default defineConfig(config);
