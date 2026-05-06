import { defineConfig } from 'vite';
/*export default defineConfig({
  plugins: [
    react(),
    basicSsl()
],
  server: {
    host: true,
    port: 5173
  },
});
*/
export default defineConfig({
    server: {
        allowedHosts: ['overbuilt-ethanol-kept.ngrok-free.dev'], // Твой адрес из консоли ngrok
        host: true,
        hmr: {
            clientPort: 443 // Чтобы Hot Module Replacement работал через https ngrok
        }
    }
});
