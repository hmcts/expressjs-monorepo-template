import * as appInsights from "applicationinsights";

export function startApplicationInsights(connectionString: string, serviceName: string): appInsights.TelemetryClient {
  // Set cloud role name via environment variable before setup (required for AI v3)
  process.env.APPLICATIONINSIGHTS_ROLE_NAME = serviceName;

  appInsights
    .setup(connectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .start();

  return appInsights.defaultClient;
}
