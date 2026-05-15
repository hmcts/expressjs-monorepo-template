import { createApp } from "./app.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  const app = await createApp();

  const server = app.listen(PORT, () => {
    console.log(`🌐 Web server running on http://localhost:${PORT}`);
  });

  return server;
}

const server = await startServer();

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
