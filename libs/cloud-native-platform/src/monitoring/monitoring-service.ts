import type * as appInsights from "applicationinsights";
import { startApplicationInsights } from "./application-insights.js";

export class MonitoringService {
  private client?: appInsights.TelemetryClient;

  constructor(
    connectionString: string,
    serviceName: string,
    private readonly logger: Logger = console
  ) {
    this.client = startApplicationInsights(connectionString, serviceName);
  }

  trackRequest(options: TrackRequestOptions): void {
    this.client?.trackRequest({
      name: options.name,
      url: options.url,
      duration: options.duration,
      resultCode: options.resultCode.toString(),
      success: options.success,
      properties: options.properties
    });
  }

  trackException(error: Error, properties?: Record<string, any>): void {
    this.logger.error(error.message, { error, ...properties });

    this.client?.trackException({
      exception: error,
      properties
    });
  }

  trackEvent(name: string, properties?: Record<string, any>): void {
    this.logger.info(`Event: ${name}`, properties);

    this.client?.trackEvent({
      name,
      properties
    });
  }

  trackMetric(name: string, value: number, properties?: Record<string, any>): void {
    this.client?.trackMetric({
      name,
      value,
      properties
    });
  }

  flush(): Promise<void> {
    return this.client?.flush() ?? Promise.resolve();
  }
}

export interface TrackRequestOptions {
  name: string;
  url: string;
  duration: number;
  resultCode: number;
  success: boolean;
  properties?: Record<string, any>;
}

export type Logger = Pick<typeof console, "log" | "info" | "warn" | "error">;
