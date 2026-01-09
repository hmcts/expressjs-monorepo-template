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

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server...");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server...");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
