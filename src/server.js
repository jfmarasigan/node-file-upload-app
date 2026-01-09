import { app } from './app.js';
import { initPool } from './db/oracle.js';
import { initSettings } from './config/config.js';

async function startServer() {
  await initPool();
  await initSettings();
  app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
  });
}

await startServer();