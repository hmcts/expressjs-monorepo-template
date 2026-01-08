import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collateSchemas } from "./collate-schema.js";

vi.mock("./schema-discovery.js", () => ({
  getPrismaSchemas: vi.fn().mockReturnValue(["/home/user/project/libs/auth/prisma", "/home/user/project/libs/posts/prisma"])
}));

describe("collate-schema", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;
  let consoleOutput: string[] = [];
  let consoleErrorOutput: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    consoleErrorOutput = [];
    console.log = vi.fn((...args) => consoleOutput.push(args.join(" ")));
    console.error = vi.fn((...args) => consoleErrorOutput.push(args.join(" ")));
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  it("should successfully collate schemas with models and enums", async () => {
    const baseSchema = `datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const libSchema1 = `model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
}

enum Role {
  USER
  ADMIN
}`;

    const libSchema2 = `model Post {
  id      String @id @default(cuid())
  title   String
  content String
}

enum Status {
  DRAFT
  PUBLISHED
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValueOnce(baseSchema).mockResolvedValueOnce(libSchema1).mockResolvedValueOnce(libSchema2),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi
        .fn()
        .mockReturnValueOnce(["/home/user/project/libs/auth/prisma/schema.prisma"])
        .mockReturnValueOnce(["/home/user/project/libs/posts/prisma/schema.prisma"])
    };

    await collateSchemas(mockDeps);

    expect(mockDeps.globSync).toHaveBeenCalledWith("**/*.prisma", {
      cwd: "/home/user/project/libs/auth/prisma",
      absolute: true
    });
    expect(mockDeps.globSync).toHaveBeenCalledWith("**/*.prisma", {
      cwd: "/home/user/project/libs/posts/prisma",
      absolute: true
    });

    expect(mockDeps.readFile).toHaveBeenCalledTimes(3);
    expect(mockDeps.mkdir).toHaveBeenCalledWith(expect.stringContaining("/dist"), { recursive: true });

    const writtenContent = mockDeps.writeFile.mock.calls[0][1];
    expect(writtenContent).toContain(baseSchema);
    expect(writtenContent).toContain("model User");
    expect(writtenContent).toContain("model Post");
    expect(writtenContent).toContain("enum Role");
    expect(writtenContent).toContain("enum Status");

    expect(consoleOutput).toContain("✅ Prisma schema collated successfully!");
    expect(consoleOutput).toContain("📊 Total: 2 models, 2 enums");
  });

  it("should handle duplicate models and enums by only including them once", async () => {
    const baseSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const libSchema1 = `model User {
  id    String @id
  email String
}

enum Role {
  USER
  ADMIN
}`;

    const libSchema2 = `model User {
  id       String @id
  email    String
  name     String
}

enum Role {
  USER
  ADMIN
  MODERATOR
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValueOnce(baseSchema).mockResolvedValueOnce(libSchema1).mockResolvedValueOnce(libSchema2),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi.fn().mockReturnValueOnce(["/libs/auth/prisma/schema.prisma"]).mockReturnValueOnce(["/libs/users/prisma/schema.prisma"])
    };

    await collateSchemas(mockDeps);

    const writtenContent = mockDeps.writeFile.mock.calls[0][1];

    const userMatches = (writtenContent.match(/model User/g) || []).length;
    const roleMatches = (writtenContent.match(/enum Role/g) || []).length;

    expect(userMatches).toBe(1);
    expect(roleMatches).toBe(1);

    expect(consoleOutput).toContain("📊 Total: 1 models, 1 enums");
  });

  it("should handle schemas with no models or enums", async () => {
    const baseSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const emptySchema = "";

    const mockDeps = {
      readFile: vi.fn().mockResolvedValueOnce(baseSchema).mockResolvedValueOnce(emptySchema),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi.fn().mockReturnValueOnce(["/libs/empty/prisma/schema.prisma"]).mockReturnValueOnce([])
    };

    await collateSchemas(mockDeps);

    const writtenContent = mockDeps.writeFile.mock.calls[0][1];
    expect(writtenContent).toBe(baseSchema);

    expect(consoleOutput).toContain("📊 Total: 0 models, 0 enums");
  });

  it("should handle multiline model definitions correctly", async () => {
    const baseSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const complexSchema = `model ComplexModel {
  id          String   @id @default(cuid())
  name        String
  description String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([name, createdAt])
  @@index([name])
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValueOnce(baseSchema).mockResolvedValueOnce(complexSchema),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi.fn().mockReturnValueOnce(["/libs/complex/prisma/schema.prisma"]).mockReturnValueOnce([])
    };

    await collateSchemas(mockDeps);

    const writtenContent = mockDeps.writeFile.mock.calls[0][1];
    expect(writtenContent).toContain("model ComplexModel");
    expect(writtenContent).toContain("@@unique([name, createdAt])");
    expect(writtenContent).toContain("@@index([name])");
  });

  it("should handle file read errors gracefully", async () => {
    const readError = new Error("Failed to read file");

    const mockDeps = {
      readFile: vi.fn().mockRejectedValue(readError),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      globSync: vi.fn().mockReturnValue([])
    };

    await expect(collateSchemas(mockDeps)).rejects.toThrow("Failed to read file");
  });

  it("should handle directory creation errors", async () => {
    const baseSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValue(baseSchema),
      writeFile: vi.fn(),
      mkdir: vi.fn().mockRejectedValue(new Error("Permission denied")),
      globSync: vi.fn().mockReturnValue([])
    };

    await expect(collateSchemas(mockDeps)).rejects.toThrow("Permission denied");
  });

  it("should handle file write errors", async () => {
    const baseSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValue(baseSchema),
      writeFile: vi.fn().mockRejectedValue(new Error("Disk full")),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi.fn().mockReturnValue([])
    };

    await expect(collateSchemas(mockDeps)).rejects.toThrow("Disk full");
  });

  it("should handle when no lib schemas are found", async () => {
    const baseSchema = `datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
  output   = "../../../libs/postgres-prisma/generated/prisma"
}`;

    const mockDeps = {
      readFile: vi.fn().mockResolvedValue(baseSchema),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      globSync: vi.fn().mockReturnValue([])
    };

    await collateSchemas(mockDeps);

    expect(mockDeps.writeFile).toHaveBeenCalledWith(expect.stringContaining("schema.prisma"), baseSchema);

    expect(consoleOutput).toContain("✅ Prisma schema collated successfully!");
    expect(consoleOutput).toContain("📊 Total: 0 models, 0 enums");
  });
});
