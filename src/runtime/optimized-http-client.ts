import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

import { getPerformanceConfig } from '../config/performance.js';

export class OptimizedHTTPClient {
  private readonly axiosInstance: AxiosInstance;

  constructor(baseURL?: string) {
    const config = getPerformanceConfig();
    this.axiosInstance = axios.create({
      baseURL,
      timeout: config.http.requestTimeout,
    });
  }

  public request<T = unknown>(
    config: Readonly<AxiosRequestConfig>
  ): Promise<AxiosResponse<T>> {
    const mutableConfig: AxiosRequestConfig = { ...config };
    return this.axiosInstance.request<T>(mutableConfig);
  }

  public get<T = unknown>(
    url: string,
    config?: Readonly<AxiosRequestConfig>
  ): Promise<AxiosResponse<T>> {
    const mutableConfig = config !== undefined ? { ...config } : undefined;
    return this.axiosInstance.get<T>(url, mutableConfig);
  }

  public post<T = unknown>(
    url: string,
    data?: unknown,
    config?: Readonly<AxiosRequestConfig>
  ): Promise<AxiosResponse<T>> {
    const mutableConfig = config !== undefined ? { ...config } : undefined;
    return this.axiosInstance.post<T>(url, data, mutableConfig);
  }

  public destroy(): void {
    // No-op placeholder for interface compatibility.
  }

  public [Symbol.dispose](): void {
    this.destroy();
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.destroy();
    return Promise.resolve();
  }
}

let globalHTTPClient: OptimizedHTTPClient | undefined;

export function getOptimizedHTTPClient(baseURL?: string): OptimizedHTTPClient {
  globalHTTPClient ??= new OptimizedHTTPClient(baseURL);
  return globalHTTPClient;
}

export function cleanupGlobalHTTPClient(): void {
  if (globalHTTPClient !== undefined) {
    globalHTTPClient.destroy();
    globalHTTPClient = undefined;
  }
}

export default OptimizedHTTPClient;
