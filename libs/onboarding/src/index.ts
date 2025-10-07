import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export main module functionality
export * from "./onboarding/validation.js";
export * from "./onboarding/session.js";
export * from "./onboarding/navigation.js";
export * from "./onboarding/service.js";
export * from "./onboarding/queries.js";

// Module configuration for app registration
export const pageRoutes = { path: path.join(__dirname, "pages") };
export const apiRoutes = { path: path.join(__dirname, "routes") };
export const prismaSchemas = path.join(__dirname, "../prisma");
export const assets = path.join(__dirname, "assets/");
