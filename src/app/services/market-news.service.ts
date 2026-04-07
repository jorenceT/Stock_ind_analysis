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

  async getSuggestedNews(symbols: string[]): Promise<MarketNewsItem[]> {
    const uniqueSymbols = Array.from(
      new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
    );

    if (!uniqueSymbols.length) {
      return [];
    }

    const params = new URLSearchParams({
      symbols: uniqueSymbols.join(','),
      filter_entities: 'true',
      limit: '10',
      language: 'en'
    });

    const data = await this.requestJson<MarketAuxNewsResponse>(`${this.newsBaseUrl}?${params.toString()}`);
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
