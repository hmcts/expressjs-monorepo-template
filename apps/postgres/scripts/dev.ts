import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const execAsync = promisify(exec);

async function startPostgresContainer() {
  console.log("Starting PostgreSQL container...");
  const databaseName = "expressjs-monorepo-template".replace("-", "_");
  const username = "hmcts";
  const password = "hmcts";

  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase(databaseName)
    .withUsername(username)
    .withPassword(password)
    .withExposedPorts({
      container: 5432,
      host: 5432,
    })
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();

  const databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${databaseName}`;

  console.log("PostgreSQL container started successfully!");
  console.log(`Database URL: ${databaseUrl}`);
  console.log(`Connection details:`);
  console.log(`  Host: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  Database: hmcts_db`);
  console.log(`  Username: hmcts`);
  console.log(`  Password: hmcts`);

  // Set environment variable for Prisma
  process.env.DATABASE_URL = databaseUrl;

  // Run Prisma migrations
  console.log("\nRunning Prisma migrations...");
  try {
    await execAsync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log("Migrations completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  }

  console.log("\nPostgreSQL is ready for development!");
  console.log("Press Ctrl+C to stop the container and exit.");

  // Keep the process running
  process.on("SIGINT", async () => {
    console.log("\nStopping PostgreSQL container...");
    await container.stop();
    console.log("Container stopped. Exiting.");
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

startPostgresContainer().catch((error) => {
  console.error("Failed to start PostgreSQL container:", error);
  process.exit(1);
});
