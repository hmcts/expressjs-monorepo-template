import { createApp } from "./app.js";

const PORT = process.env.API_PORT || 3001;

async function startServer() {
  const app = await createApp();

  const server = app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Readiness check: http://localhost:${PORT}/health/readiness`);
    console.log(`📊 Liveness check: http://localhost:${PORT}/health/liveness`);
    console.log(`🔌 API routes: http://localhost:${PORT}/api`);
  });

  return server;
}

const serverPromise = startServer();

process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  const server = await serverPromise;
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  const server = await serverPromise;
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
