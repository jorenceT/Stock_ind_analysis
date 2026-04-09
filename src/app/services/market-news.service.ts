import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { MARKET_PROXY_BASE_URL } from './proxy-config';

export interface MarketNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  symbols: string[];
}

interface MarketAuxNewsResponse {
  data?: Array<{
    title?: string;
    url?: string;
    source?: string;
    published_at?: string;
    description?: string;
    snippet?: string;
    symbols?: Array<{ symbol?: string }>;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class MarketNewsService {
  private readonly newsBaseUrl = '/api/marketaux/v1/news/all';

  async getSuggestedNews(forceFresh = false): Promise<MarketNewsItem[]> {
    return this.getNews({ limit: 10, countries: 'in' }, forceFresh);
  }

  async getNewsForSymbols(symbols: string[], limit = 10, forceFresh = false): Promise<MarketNewsItem[]> {
    const cleanedSymbols = symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    if (!cleanedSymbols.length) {
      return [];
    }

    return this.getNews({
      limit,
      symbols: cleanedSymbols.join(','),
      filter_entities: 'true',
      countries: 'in'
    }, forceFresh);
  }

  private async getNews(params: Record<string, string | number | boolean>, forceFresh = false): Promise<MarketNewsItem[]> {
    const searchParams = new URLSearchParams(
      Object.entries(params).reduce<Record<string, string>>((accumulator, [key, value]) => {
        accumulator[key] = String(value);
        return accumulator;
      }, {})
    );

    if (forceFresh) {
      searchParams.set('_ts', String(Date.now()));
    }

    const data = await this.requestJson<MarketAuxNewsResponse>(`${this.newsBaseUrl}?${searchParams.toString()}`);
    return (data.data ?? [])
      .map((item) => ({
        title: item.title ?? 'Untitled news item',
        url: item.url ?? '#',
        source: item.source ?? 'MarketAux',
        publishedAt: item.published_at ?? '',
        snippet: item.description ?? item.snippet ?? '',
        symbols: (item.symbols ?? []).map((entry) => entry.symbol ?? '').filter(Boolean)
      }))
      .filter((item) => Boolean(item.url) && Boolean(item.title));
  }

  private async requestJson<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    if (Capacitor.getPlatform() === 'web') {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Live news lookup is unavailable right now.');
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

    return path;
  }
}
