import { Injectable } from '@angular/core';
import { MarketNewsItem } from './market-news.service';
import { Stock } from '../models/stock.model';

export interface AiStockInsight {
  symbol: string;
  action: 'BUY' | 'HOLD' | 'SELL';
  reason: string;
  summary: string;
}

export interface AiAnalysisResult {
  marketSummary: string;
  watchlistInsights: AiStockInsight[];
  topPicks: AiStockInsight[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AiAnalysisService {
  async analyzeNews(params: {
    apiKey: string;
    model: string;
    news: MarketNewsItem[];
    watchlist: Stock[];
  }): Promise<AiAnalysisResult> {
    const parsed = await this.runWithRetry(() =>
      this.generateAnalysis(params, this.buildPrompt(params.news, params.watchlist, !this.usesSystemInstruction(params.model)))
    );
    const watchlistSymbols = params.watchlist.map((stock) => this.normalizeSymbol(stock.symbol));
    const missingSymbols = params.watchlist.filter(
      (stock) => !parsed.watchlistInsights.some((insight) => this.normalizeSymbol(insight.symbol) === this.normalizeSymbol(stock.symbol))
    );

    if (missingSymbols.length) {
      const repair = await this.runWithRetry(() =>
        this.generateAnalysis(
          params,
          this.buildWatchlistRepairPrompt(params.news, missingSymbols, !this.usesSystemInstruction(params.model))
        )
      );

      parsed.watchlistInsights = this.mergeInsights(parsed.watchlistInsights, repair.watchlistInsights);
    }

    return {
      marketSummary: parsed.marketSummary || 'No summary returned.',
      watchlistInsights: Array.isArray(parsed.watchlistInsights) ? parsed.watchlistInsights : [],
      topPicks: Array.isArray(parsed.topPicks)
        ? parsed.topPicks.filter((pick) => !watchlistSymbols.includes(this.normalizeSymbol(pick.symbol)))
        : []
    };
  }

  async analyzeWatchlistItem(params: {
    apiKey: string;
    model: string;
    news: MarketNewsItem[];
    stock: Stock;
  }): Promise<AiStockInsight> {
    const result = await this.runWithRetry(() =>
      this.generateAnalysis(
        { apiKey: params.apiKey, model: params.model, news: params.news, watchlist: [params.stock] },
        this.buildSingleStockPrompt(params.news, params.stock, !this.usesSystemInstruction(params.model))
      )
    );

    const insight = result.watchlistInsights.find(
      (item) => this.normalizeSymbol(item.symbol) === this.normalizeSymbol(params.stock.symbol)
    );

    return (
      insight ?? {
        symbol: params.stock.symbol,
        action: 'HOLD',
        reason: 'Gemini did not return a single-symbol insight.',
        summary: 'No AI insight returned.'
      }
    );
  }

  private async generateAnalysis(
    params: { apiKey: string; model: string; news: MarketNewsItem[]; watchlist: Stock[] },
    prompt: string
  ): Promise<AiAnalysisResult> {
    const useSystemInstruction = this.usesSystemInstruction(params.model);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey
      },
      body: JSON.stringify(this.buildRequestBody(prompt, useSystemInstruction))
    });

    const payload = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message || 'Gemini analysis failed.');
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    return this.parseAnalysisResponse(text);
  }

  private usesSystemInstruction(model: string): boolean {
    return model.trim().toLowerCase().startsWith('gemini-');
  }

  private buildRequestBody(prompt: string, useSystemInstruction: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    };

    if (useSystemInstruction) {
      body['systemInstruction'] = {
        parts: [
          {
            text:
              'You are an expert Indian Equity Research Analyst. Your task is to perform technical and fundamental sentiment analysis.\n' +
              'Constraints:\n' +
              '1. Use ONLY the provided News and Universe data.\n' +
              '2. Output MUST be a single, valid JSON object.\n' +
              "3. If news is ambiguous or contradictory to the Stock Snapshot (e.g., high RSI vs bad news), default to 'HOLD'.\n" +
              '4. Prioritize stocks mentioned specifically in the news snippets (e.g., Tata Motors, IT stocks).'
          }
        ]
      };
    }

    return body;
  }

  private buildPrompt(
    news: MarketNewsItem[],
    watchlist: Stock[],
    includeInstructions: boolean
  ): string {
    const compactNews = news.slice(0, 8).map((item) => ({
      title: item.title,
      snippet: item.snippet
    }));

    const compactWatchlist = watchlist.map((stock) => ({
      symbol: stock.symbol,
      price: stock.currentPrice,
      dayPct: stock.dayChangePercent,
      ma20: stock.movingAverage20,
      rsi: stock.rsi
    }));

    const parts = includeInstructions
      ? [
          'You are an expert Indian Equity Research Analyst. Your task is to perform technical and fundamental sentiment analysis.',
          'Constraints:',
          '1. Use ONLY the provided News and Watchlist data.',
          '2. Output MUST be a single, valid JSON object.',
          "3. If news is ambiguous or contradictory to the Stock Snapshot (e.g., high RSI vs bad news), default to 'HOLD'.",
          '4. Prioritize stocks mentioned specifically in the news snippets.',
          '5. You must return exactly one watchlistInsights entry for every watchlist symbol provided.',
          '6. topPicks must NOT include any stock that is already in the watchlist.',
          ''
        ]
      : [];

    return [
      ...parts,
      'Analyze the supplied News and Watchlist data.',
      'Return ONLY JSON with this schema:',
      '{ "marketSummary": string, "watchlistInsights": [{"symbol": string, "action": "BUY"|"HOLD"|"SELL", "reason": string, "summary": string}], "topPicks": [{"symbol": string, "action": "BUY"|"HOLD"|"SELL", "reason": string, "summary": string}] }',
      'For each watchlist symbol, decide BUY, HOLD, or SELL based on the news and the stock snapshot.',
      'The watchlistInsights array must include every watchlist symbol exactly once.',
      'The topPicks array must contain only news-driven recommendations that are not already present in the watchlist.',
      `News: ${JSON.stringify(compactNews)}`,
      `Watchlist: ${JSON.stringify(compactWatchlist)}`
    ].join('\n');
  }

  private buildWatchlistRepairPrompt(
    news: MarketNewsItem[],
    watchlist: Stock[],
    includeInstructions: boolean
  ): string {
    const compactNews = news.slice(0, 8).map((item) => ({
      title: item.title,
      snippet: item.snippet
    }));

    const compactWatchlist = watchlist.map((stock) => ({
      symbol: stock.symbol,
      price: stock.currentPrice,
      dayPct: stock.dayChangePercent,
      ma20: stock.movingAverage20,
      rsi: stock.rsi
    }));

    const parts = includeInstructions
      ? [
          'You are an expert Indian Equity Research Analyst.',
          'Use ONLY the provided News and Watchlist data.',
          'Output MUST be a single valid JSON object.',
          'Return one watchlistInsights entry for every watchlist symbol.',
          ''
        ]
      : [];

    return [
      ...parts,
      'Return ONLY JSON with this schema:',
      '{ "marketSummary": string, "watchlistInsights": [{"symbol": string, "action": "BUY"|"HOLD"|"SELL", "reason": string, "summary": string}], "topPicks": [] }',
      'Do not skip any watchlist symbol.',
      `News: ${JSON.stringify(compactNews)}`,
      `Watchlist: ${JSON.stringify(compactWatchlist)}`
    ].join('\n');
  }

  private buildSingleStockPrompt(news: MarketNewsItem[], stock: Stock, includeInstructions: boolean): string {
    const compactNews = news.slice(0, 8).map((item) => ({
      title: item.title,
      snippet: item.snippet,
      symbols: item.symbols
    }));

    const compactStock = {
      symbol: stock.symbol,
      price: stock.currentPrice,
      dayPct: stock.dayChangePercent,
      ma20: stock.movingAverage20,
      rsi: stock.rsi
    };

    const parts = includeInstructions
      ? [
          'You are an expert Indian Equity Research Analyst.',
          'Use ONLY the provided News and Watchlist data.',
          'Output MUST be a single valid JSON object.',
          'Return one watchlistInsights entry for the single watchlist symbol provided.',
          ''
        ]
      : [];

    return [
      ...parts,
      'Return ONLY JSON with this schema:',
      '{ "marketSummary": string, "watchlistInsights": [{"symbol": string, "action": "BUY"|"HOLD"|"SELL", "reason": string, "summary": string}], "topPicks": [] }',
      'Do not skip the provided watchlist symbol.',
      `News: ${JSON.stringify(compactNews)}`,
      `Watchlist: ${JSON.stringify([compactStock])}`
    ].join('\n');
  }

  private mergeInsights(existing: AiStockInsight[], incoming: AiStockInsight[]): AiStockInsight[] {
    const merged = [...existing];

    for (const insight of incoming) {
      const index = merged.findIndex((item) => this.normalizeSymbol(item.symbol) === this.normalizeSymbol(insight.symbol));
      if (index >= 0) {
        merged[index] = insight;
      } else {
        merged.push(insight);
      }
    }

    return merged;
  }

  private parseAnalysisResponse(text: string): AiAnalysisResult {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(candidate) as AiAnalysisResult;

    return {
      marketSummary: parsed.marketSummary || '',
      watchlistInsights: Array.isArray(parsed.watchlistInsights) ? parsed.watchlistInsights : [],
      topPicks: Array.isArray(parsed.topPicks) ? parsed.topPicks : []
    };
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase().replace(/\.NS$/i, '').replace(/\.BO$/i, '');
  }

  private async runWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
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

    throw new Error('Gemini analysis failed.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
