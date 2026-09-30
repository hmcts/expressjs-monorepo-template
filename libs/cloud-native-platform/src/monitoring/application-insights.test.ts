import * as appInsights from "applicationinsights";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startApplicationInsights } from "./application-insights.js";

vi.mock("applicationinsights", () => {
  const mockSetup = {
    setAutoCollectRequests: vi.fn(() => mockSetup),
    setAutoCollectPerformance: vi.fn(() => mockSetup),
    setAutoCollectExceptions: vi.fn(() => mockSetup),
    setAutoCollectDependencies: vi.fn(() => mockSetup),
    setAutoCollectConsole: vi.fn(() => mockSetup),
    setUseDiskRetryCaching: vi.fn(() => mockSetup),
    start: vi.fn(() => mockSetup)
  };

  return {
    setup: vi.fn(() => mockSetup),
    defaultClient: { flush: vi.fn() }
  };
});

describe("startApplicationInsights", () => {
  const connectionString = "InstrumentationKey=test";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set up Application Insights with auto-collection enabled", () => {
    startApplicationInsights(connectionString, "test-service");

    expect(appInsights.setup).toHaveBeenCalledWith(connectionString);
    const setupMock = vi.mocked(appInsights.setup)(connectionString);
    expect(setupMock.setAutoCollectRequests).toHaveBeenCalledWith(true);
    expect(setupMock.setAutoCollectPerformance).toHaveBeenCalledWith(true, true);
    expect(setupMock.setAutoCollectExceptions).toHaveBeenCalledWith(true);
    expect(setupMock.setAutoCollectDependencies).toHaveBeenCalledWith(true);
    expect(setupMock.setAutoCollectConsole).toHaveBeenCalledWith(true, true);
    expect(setupMock.setUseDiskRetryCaching).toHaveBeenCalledWith(true);
    expect(setupMock.start).toHaveBeenCalled();
  });

  it("should set the cloud role name", () => {
    startApplicationInsights(connectionString, "test-service");

    expect(process.env.APPLICATIONINSIGHTS_ROLE_NAME).toBe("test-service");
  });

  it("should return the default client", () => {
    const client = startApplicationInsights(connectionString, "test-service");

    expect(client).toBe(appInsights.defaultClient);
  });
});
