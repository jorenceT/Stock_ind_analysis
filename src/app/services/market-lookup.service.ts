import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Stock } from '../models/stock.model';
import { MarketSearchResult } from '../models/market-search-result.model';
import { MARKET_PROXY_BASE_URL } from './proxy-config';

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    exchDisp?: string;
  }>;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        shortName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MarketLookupService {
  private readonly searchBaseUrl = '/api/yahoo/v1/finance/search';
  private readonly chartBaseUrl = '/api/yahoo/v8/finance/chart';

  async searchSymbols(query: string): Promise<MarketSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const data = await this.requestJson<YahooSearchResponse>(
      `${this.searchBaseUrl}?q=${encodeURIComponent(trimmed)}&quotesCount=8&newsCount=0`
    );
    return (data.quotes ?? [])
      .filter((item) => (item.quoteType ?? '').toUpperCase() === 'EQUITY')
      .filter((item) => (item.exchDisp ?? '').toUpperCase().includes('NSE') || (item.symbol ?? '').toUpperCase().endsWith('.NS'))
      .map((item) => ({
        symbol: item.symbol ?? '',
        companyName: item.longname ?? item.shortname ?? item.symbol ?? '',
        exchange: 'NSE' as const,
        quoteType: item.quoteType ?? 'EQUITY'
      }))
      .filter((item) => Boolean(item.symbol));
  }

  async resolveSymbol(query: string): Promise<MarketSearchResult | undefined> {
    const results = await this.searchSymbols(query);
    const normalized = this.normalize(query);

    // Try exact matches first
    const exactSymbolMatch = results.find((item) => this.normalize(item.symbol) === normalized);
    if (exactSymbolMatch) {
      return exactSymbolMatch;
    }

    const exactNameMatch = results.find((item) => this.normalize(item.companyName) === normalized);
    if (exactNameMatch) {
      return exactNameMatch;
    }

    // Try partial matches
    const startsWithName = results.find((item) => this.normalize(item.companyName).startsWith(normalized));
    if (startsWithName) {
      return startsWithName;
    }

    const includesInName = results.find((item) => this.normalize(item.companyName).includes(normalized));
    if (includesInName) {
      return includesInName;
    }

    const startsWithSymbol = results.find((item) => this.normalize(item.symbol).startsWith(normalized));
    if (startsWithSymbol) {
      return startsWithSymbol;
    }

    // Return first result if no matches found
    return results[0];
  }

  async getLiveStock(symbol: string, fallbackName?: string): Promise<Stock | undefined> {
    const path = `${this.chartBaseUrl}/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await this.requestJson<YahooChartResponse>(path);
        const result = data.chart?.result?.[0];
        const meta = result?.meta;
        const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter((value): value is number => typeof value === 'number');

        if (!meta?.regularMarketPrice || closes.length === 0) {
          continue;
        }

        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.chartPreviousClose ?? closes[closes.length - 2] ?? currentPrice;
        const dayChangePercent = previousClose ? Number((((currentPrice - previousClose) / previousClose) * 100).toFixed(2)) : 0;
        const movingAverage20 = this.average(closes.slice(-20));
        const rsi = this.calculateRsi(closes);

        return {
          symbol: symbol.toUpperCase(),
          companyName: meta.shortName ?? fallbackName ?? symbol.toUpperCase(),
          exchange: 'NSE',
          currentPrice,
          dayChangePercent,
          movingAverage20,
          rsi
        };
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await this.delay(250 * (attempt + 1));
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    return undefined;
  }

  private average(values: number[]): number {
    if (!values.length) {
      return 0;
    }

    const sum = values.reduce((total, value) => total + value, 0);
    return Number((sum / values.length).toFixed(2));
  }

  private calculateRsi(closes: number[]): number {
    if (closes.length < 2) {
      return 50;
    }

    const period = Math.min(14, closes.length - 1);
    let gains = 0;
    let losses = 0;

    for (let index = closes.length - period; index < closes.length; index += 1) {
      const change = closes[index] - closes[index - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    if (losses === 0) {
      return 100;
    }

    const rs = gains / losses;
    return Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  private async requestJson<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    if (Capacitor.getPlatform() === 'web') {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Live market lookup is unavailable right now.');
      }

      return (await response.json()) as T;
    }

    const response = await CapacitorHttp.request({
      url,
      method: 'GET'
    });

    return response.data as T;
  }

  private buildUrl(path: string): string {
    if (MARKET_PROXY_BASE_URL) {
      return `${MARKET_PROXY_BASE_URL}${path}`;
    }

    if (Capacitor.getPlatform() === 'web') {
      return path;
    }

    return `https://query1.finance.yahoo.com${path.replace(/^\/api\/yahoo/, '')}`;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
