import { beforeEach, describe, expect, it, vi } from "vitest";
import { expressSessionPostgres } from "./postgres-session.js";

vi.mock("./postgres-store.js", () => ({
  // biome-ignore lint/complexity/useArrowFunction: Vitest 4 requires function keyword for constructors
  PostgresStore: vi.fn().mockImplementation(function (options) {
    return { pgStoreOptions: options };
  })
}));

vi.mock("express-session", () => ({
  // biome-ignore lint/complexity/useArrowFunction: Vitest 4 requires function keyword for constructors
  default: vi.fn().mockImplementation(function (options) {
    return { sessionOptions: options };
  }),
  Store: class {}
}));

describe("expressSessionPostgres", () => {
  const mockPool = { connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
  });

  it("should create session middleware with default options", () => {
    const middleware = expressSessionPostgres({
      pgConnection: mockPool as any
    });

    expect(middleware).toEqual({
      sessionOptions: expect.objectContaining({
        secret: "default-secret-change-in-production",
        resave: false,
        saveUninitialized: false,
        cookie: expect.objectContaining({
          secure: false,
          httpOnly: true,
          maxAge: 1000 * 60 * 60 * 24
        }),
        store: expect.objectContaining({
          pgStoreOptions: expect.objectContaining({
            pool: mockPool
          })
        })
      })
    });
  });

  it("should use SESSION_SECRET from environment", () => {
    process.env.SESSION_SECRET = "pg-secret";

    const middleware = expressSessionPostgres({
      pgConnection: mockPool as any
    });

    expect(middleware).toEqual({
      sessionOptions: expect.objectContaining({
        secret: "pg-secret"
      })
    });
  });

  it("should set secure cookie in production", () => {
    process.env.NODE_ENV = "production";

    const middleware = expressSessionPostgres({
      pgConnection: mockPool as any
    });

    expect(middleware).toEqual({
      sessionOptions: expect.objectContaining({
        cookie: expect.objectContaining({
          secure: true
        })
      })
    });
  });

  it("should allow custom store options", () => {
    const middleware = expressSessionPostgres({
      pgConnection: mockPool as any,
      storeOptions: {
        tableName: "custom_sessions",
        schemaName: "app",
        ttl: 7200
      }
    });

    expect(middleware).toEqual({
      sessionOptions: expect.objectContaining({
        store: expect.objectContaining({
          pgStoreOptions: expect.objectContaining({
            pool: mockPool,
            tableName: "custom_sessions",
            schemaName: "app",
            ttl: 7200
          })
        })
      })
    });
  });

  it("should allow custom cookie maxAge", () => {
    const middleware = expressSessionPostgres({
      pgConnection: mockPool as any,
      cookieMaxAge: 1000 * 60 * 60 * 2
    });

    expect(middleware).toEqual({
      sessionOptions: expect.objectContaining({
        cookie: expect.objectContaining({
          maxAge: 1000 * 60 * 60 * 2
        })
      })
    });
  });
});
