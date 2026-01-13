import { toast } from "sonner";

interface Settings {
  apiLimits: boolean;
  caching: boolean;
  logging: boolean;
  timeout: string;
}

class SettingsService {
  private static instance: SettingsService;
  private settings: Settings;
  private cache: Map<string, { data: any; timestamp: number }>;
  private requestCounts: Map<string, { count: number; timestamp: number }>;
  private readonly RATE_LIMIT = 100; // requests per minute
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  private constructor() {
    this.settings = {
      apiLimits: true,
      caching: true,
      logging: true,
      timeout: '30'
    };
    this.cache = new Map();
    this.requestCounts = new Map();
  }

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  public getSettings(): Settings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Settings): void {
    this.settings = { ...newSettings };
    if (!this.settings.caching) {
      this.clearCache();
    }
  }

  public async handleRequest(key: string, requestFn: () => Promise<any>): Promise<any> {
    // Request logging
    if (this.settings.logging) {
      console.log(`[${new Date().toISOString()}] Request to: ${key}`);
    }

    // Rate limiting
    if (this.settings.apiLimits) {
      const isRateLimited = this.checkRateLimit(key);
      if (isRateLimited) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }

    // Result caching - BYPASSED FOR NOW to ensure tests reflect latest endpoint definition
    /*
    if (this.settings.caching) { 
      const cachedResult = this.getCachedResult(key);
      if (cachedResult) {
        if (this.settings.logging) {
          console.log(`[${new Date().toISOString()}] Cache hit for: ${key}`);
        }
        return cachedResult; 
      }
    }
    */

    // Always execute the request function now
    try {
      const result = await requestFn();
      
      // Still cache the result if caching is enabled (optional)
      if (this.settings.caching) {
        this.cacheResult(key, result);
      }

      return result;
    } catch (error) {
      if (this.settings.logging) {
        console.error(`[${new Date().toISOString()}] Error for ${key}:`, error);
      }
      throw error;
    }
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    const requestInfo = this.requestCounts.get(key) || { count: 0, timestamp: now };
    
    if (requestInfo.timestamp < windowStart) {
      // Reset counter for new window
      requestInfo.count = 1;
      requestInfo.timestamp = now;
    } else {
      requestInfo.count++;
    }
    
    this.requestCounts.set(key, requestInfo);
    
    return requestInfo.count > this.RATE_LIMIT;
  }

  private getCachedResult(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private cacheResult(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private clearCache(): void {
    this.cache.clear();
  }
}

export const settingsService = SettingsService.getInstance(); 