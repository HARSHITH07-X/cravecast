import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import restaurantRouter from './server/routes/restaurant.js';
import salesRouter from './server/routes/sales.js';
import menuRouter from './server/routes/menu.js';
import forecastRouter from './server/routes/forecast.js';
import plannerRouter from './server/routes/planner.js';
import agentRouter from './server/routes/agent.js';
import publicRouter from './server/routes/public.js';
import { CONFIG } from './server/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON parser with untrusted size ceiling (20MB max for photo uploads)
  app.use(express.json({ limit: '20mb' }));

  // API Routes
  app.use('/api/public', publicRouter);
  app.use('/api', restaurantRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/events', salesRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/forecast', forecastRouter);
  app.use('/api/plan', plannerRouter);
  app.use('/api/agent', agentRouter);

  // Health route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'CraveCast', time: new Date().toISOString() });
  });

  // Vite Middleware in Dev vs Static in Prod
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CraveCast server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
