import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiAnalysisResult, AiAnalysisService, AiStockInsight } from './services/ai-analysis.service';
import { MarketSearchResult } from './models/market-search-result.model';
import { Stock, StockSignal } from './models/stock.model';
import { MarketNewsItem, MarketNewsService } from './services/market-news.service';
import { MarketLookupService } from './services/market-lookup.service';
import { DashboardCacheService } from './services/dashboard-cache.service';
import { NotificationService } from './services/notification.service';
import { SignalService } from './services/signal.service';
import { StockDataService } from './services/stock-data.service';
import { WatchlistItem, WatchlistService } from './services/watchlist.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Mini AI stock advisor';
  addSymbol = '';
  aiApiKey = localStorage.getItem('geminiApiKey') ?? '';
  aiModel = localStorage.getItem('geminiModel') ?? 'gemma-3-27b-it';
  aiSettingsOpen = !this.aiApiKey;
  aiErrorMessage = '';
  aiSummary = '';
  aiWatchlistInsights: AiStockInsight[] = [];
  aiTopPicks: AiStockInsight[] = [];

  searchResults: MarketSearchResult[] = [];
  searching = false;
  suggestedNews: MarketNewsItem[] = [];
  newsLoading = false;
  analysisLoading = false;
  aiLoading = false;
  refreshingSymbol: string | null = null;
  watchSignals: StockSignal[] = [];
  topPicks: StockSignal[] = [];
  message = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly stockDataService: StockDataService,
    private readonly watchlistService: WatchlistService,
    private readonly marketLookupService: MarketLookupService,
    private readonly marketNewsService: MarketNewsService,
    private readonly dashboardCacheService: DashboardCacheService,
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly signalService: SignalService,
    private readonly notificationService: NotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    const cached = this.dashboardCacheService.loadSnapshot();
    if (cached) {
      this.watchSignals = cached.watchSignals ?? [];
      this.suggestedNews = cached.suggestedNews ?? [];
      this.aiSummary = cached.aiSummary ?? '';
      this.aiWatchlistInsights = cached.aiWatchlistInsights ?? [];
      this.aiTopPicks = cached.aiTopPicks ?? [];
      this.topPicks = cached.topPicks ?? [];
      this.message = cached.message || 'Loaded cached dashboard data.';
    }

    const watchlistItems = this.watchlistService.getWatchlistItems();
    const watchlistNeedsSync = this.watchSignals.length !== watchlistItems.length || !this.watchlistMatchesSignals(watchlistItems);

    if (!cached || this.dashboardCacheService.isExpired(cached.savedAt) || watchlistNeedsSync) {
      this.message = cached ? 'Cached data expired. Refreshing market data...' : 'Loading live market data...';
      void this.refreshData(true);
    }

    const canNotify = await this.notificationService.requestPermission();
    if (canNotify) {
      this.notificationService.scheduleMorningDigest(this.watchSignals, this.topPicks);
      this.message = 'Daily morning notification scheduled for 9:00 AM.';
    } else {
      this.message = 'Enable browser notifications for daily morning buy/sell alerts.';
    }

    void this.recoverMissingAnalysis();
  }

  addStock(): void {
    if (!this.addSymbol) {
      return;
    }

    const stock = this.stockDataService.findBySymbol(this.addSymbol) ?? this.stockDataService.findByName(this.addSymbol);
    if (!stock) {
      void this.addFromLiveLookup(this.addSymbol);
      return;
    }

    this.watchlistService.addToWatchlist(stock.symbol, stock.companyName);
    this.addSymbol = '';
    this.searchResults = [];
    void this.refreshNewWatchlistItem(stock.symbol, stock.companyName);
  }

  onSymbolInput(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    const query = this.addSymbol.trim();
    if (!query) {
      this.searchResults = [];
      return;
    }

    this.searching = true;
    this.searchTimer = setTimeout(() => {
      void this.loadSuggestions(query);
    }, 250);
  }

  selectSuggestion(result: MarketSearchResult): void {
    this.addSymbol = result.symbol;
    this.searchResults = [];
    this.message = `${result.companyName} selected.`;
  }

  removeStock(symbol: string): void {
    this.watchlistService.removeFromWatchlist(symbol);
    this.watchSignals = this.watchSignals.filter(
      (signal) => this.normalizeSymbol(signal.stock.symbol) !== this.normalizeSymbol(symbol)
    );
    this.aiWatchlistInsights = this.aiWatchlistInsights.filter(
      (insight) => this.normalizeSymbol(insight.symbol) !== this.normalizeSymbol(symbol)
    );
    this.topPicks = this.topPicks.filter((pick) => this.normalizeSymbol(pick.stock.symbol) !== this.normalizeSymbol(symbol));
    this.message = 'Watchlist item removed.';
    this.dashboardCacheService.saveSnapshot({
      watchSignals: this.watchSignals,
      suggestedNews: this.suggestedNews,
      aiSummary: this.aiSummary,
      aiWatchlistInsights: this.aiWatchlistInsights,
      aiTopPicks: this.aiTopPicks,
      topPicks: this.topPicks,
      message: this.message
    });
  }

  sendNow(): void {
    this.notificationService.sendDigest(this.watchSignals, this.topPicks);
    this.message = 'Notification sent now.';
  }

  getLatestNews(): void {
    void this.refreshLatestNews();
  }

  saveAiSettings(): void {
    this.aiApiKey = this.aiApiKey.trim();
    this.aiModel = this.aiModel.trim() || 'gemma-3-27b-it';
    if (!this.aiApiKey) {
      this.aiErrorMessage = 'Gemini API key is required.';
      this.aiSettingsOpen = true;
      return;
    }

    localStorage.setItem('geminiApiKey', this.aiApiKey);
    localStorage.setItem('geminiModel', this.aiModel);
    this.aiErrorMessage = '';
    this.aiSettingsOpen = false;
    void this.runAiAnalysis();
  }

  openAiSettings(message?: string): void {
    this.aiErrorMessage = message ?? '';
    this.aiSettingsOpen = true;
  }

  getAiInsight(symbol: string): AiStockInsight | undefined {
    const normalized = this.normalizeSymbol(symbol);
    return this.aiWatchlistInsights.find((insight) => this.normalizeSymbol(insight.symbol) === normalized);
  }

  getResolvedAiInsight(symbol: string): AiStockInsight | undefined {
    const insight = this.getAiInsight(symbol);
    if (insight) {
      return insight;
    }

    if (this.refreshingSymbol && this.normalizeSymbol(this.refreshingSymbol) === this.normalizeSymbol(symbol)) {
      return undefined;
    }

    return {
      symbol,
      action: 'HOLD',
      reason: 'AI analysis getting loaded...',
      summary: 'No watchlist insight returned.'
    };
  }

  get isBuilding(): boolean {
    return this.analysisLoading || this.newsLoading || this.aiLoading;
  }

  private async refreshData(forceRefresh = false): Promise<void> {
    const universe = this.stockDataService.getUniverse();
    const watchlistItems = this.watchlistService.getWatchlistItems();
    const watchlistStocks = watchlistItems.map((item) => this.toWatchlistStock(item, universe));

    this.watchSignals = watchlistStocks.map((stock) => this.signalService.getSignal(stock));

    this.topPicks = this.signalService.getTopPicks(universe);
    this.analysisLoading = true;
    if (forceRefresh || !this.watchSignals.length || !this.watchlistMatchesSignals(watchlistItems)) {
      await this.refreshLiveWatchlist(watchlistItems, universe);
    }

    if (forceRefresh || !this.suggestedNews.length) {
      await this.refreshSuggestedNewsForWatchlist(watchlistStocks, this.topPicks);
    }

    if (forceRefresh || !this.aiWatchlistInsights.length || !this.aiSummary) {
      await this.runAiAnalysis(watchlistStocks);
    }

    this.dashboardCacheService.saveSnapshot({
      watchSignals: this.watchSignals,
      suggestedNews: this.suggestedNews,
      aiSummary: this.aiSummary,
      aiWatchlistInsights: this.aiWatchlistInsights,
      aiTopPicks: this.aiTopPicks,
      topPicks: this.topPicks,
      message: this.message
    });
  }

  private async recoverMissingAnalysis(): Promise<void> {
    if (this.aiLoading || this.analysisLoading) {
      return;
    }

    const hasWatchlist = this.watchlistService.getWatchlistItems().length > 0;
    const missingInsights = hasWatchlist && (!this.aiSummary || !this.aiWatchlistInsights.length);
    const stalePlaceholder = this.aiWatchlistInsights.some(
      (insight) => insight.reason.includes('AI analysis getting loaded') || insight.summary.includes('No watchlist insight returned')
    );

    if (!missingInsights && !stalePlaceholder) {
      return;
    }

    const universe = this.stockDataService.getUniverse();
    const watchlistStocks = this.watchlistService.getWatchlistItems().map((item) => this.toWatchlistStock(item, universe));
    if (!watchlistStocks.length) {
      return;
    }

    this.message = 'Rebuilding AI analysis...';
    await this.refreshLiveWatchlist(this.watchlistService.getWatchlistItems(), universe);
    await this.refreshSuggestedNewsForWatchlist(watchlistStocks, this.topPicks, true);
    await this.runAiAnalysis(watchlistStocks);
  }

  private async loadSuggestions(query: string): Promise<void> {
    try {
      const results = await this.marketLookupService.searchSymbols(query);
      this.searchResults = results;
      this.message = results.length ? 'Live NSE suggestions loaded.' : 'No NSE matches found yet.';
    } catch (error) {
      this.searchResults = [];
      this.message = error instanceof Error ? error.message : 'Unable to load live suggestions.';
    } finally {
      this.searching = false;
    }
  }

  private async addFromLiveLookup(query: string): Promise<void> {
    try {
      this.message = 'Looking up live NSE symbol...';
      const result = await this.marketLookupService.resolveSymbol(query);
      if (!result) {
        this.message = `No live NSE match found for ${query.toUpperCase()}.`;
        return;
      }

      this.watchlistService.addToWatchlist(result.symbol, result.companyName);
      this.addSymbol = '';
      this.searchResults = [];
      this.message = `${result.companyName} added to your watchlist.`;
      await this.refreshNewWatchlistItem(result.symbol, result.companyName);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Unable to add symbol right now.';
    }
  }

  private async refreshLiveWatchlist(
    watchlistItems: WatchlistItem[],
    universe: ReturnType<StockDataService['getUniverse']>
  ): Promise<void> {
    const snapshotSignals = (
      await Promise.all(
        watchlistItems.map(async (item) => {
          const fallback = this.toWatchlistStock(item, universe);
          const liveStock = await this.getLiveStockWithZeroRetry(item.symbol, item.companyName, fallback.currentPrice === 0);
          return this.signalService.getSignal(liveStock ?? fallback);
        })
      )
    ).filter((signal): signal is StockSignal => Boolean(signal));

    if (snapshotSignals.length) {
      this.watchSignals = snapshotSignals;
    }
  }

  private async refreshSuggestedNewsForWatchlist(
    watchlistStocks: Stock[],
    topPicks: StockSignal[],
    forceFresh = false
  ): Promise<void> {
    this.newsLoading = true;

    try {
      const watchlistSymbols = watchlistStocks.map((stock) => stock.symbol);
      const topPickSymbols = topPicks.map((pick) => pick.stock.symbol);
      const [watchlistNews, topPickNews] = await Promise.all([
        this.marketNewsService.getNewsForSymbols(
          watchlistSymbols,
          Math.max(10, watchlistSymbols.length * 2),
          forceFresh
        ),
        this.marketNewsService.getNewsForSymbols(
          topPickSymbols,
          Math.max(10, topPickSymbols.length * 2),
          forceFresh
        )
      ]);

      this.suggestedNews = this.mergeNews(watchlistNews, topPickNews);
      if (this.suggestedNews.length) {
        this.message = 'Market news loaded for watchlist and top pick stocks.';
      }
      this.dashboardCacheService.saveSnapshot({
        watchSignals: this.watchSignals,
        suggestedNews: this.suggestedNews,
        aiSummary: this.aiSummary,
        aiWatchlistInsights: this.aiWatchlistInsights,
        aiTopPicks: this.aiTopPicks,
        topPicks: this.topPicks,
        message: this.message
      });
    } catch (error) {
      this.suggestedNews = [];
      this.message = error instanceof Error ? error.message : 'Unable to load market news right now.';
    } finally {
      this.newsLoading = false;
    }
  }

  private async refreshLatestNews(): Promise<void> {
    this.newsLoading = true;

    const universe = this.stockDataService.getUniverse();
    const watchlistItems = this.watchlistService.getWatchlistItems();
    const watchlistStocks = watchlistItems.map((item) => this.toWatchlistStock(item, universe));

    try {
      const topPickStocks = this.topPicks.length ? this.topPicks : this.signalService.getTopPicks(universe);
      const topPickSymbols = topPickStocks.map((pick) => pick.stock.symbol);
      const watchlistSymbols = watchlistStocks.map((stock) => stock.symbol);
      const [watchlistNews, topPickNews] = await Promise.all([
        watchlistSymbols.length
          ? this.marketNewsService.getNewsForSymbols(watchlistSymbols, Math.max(10, watchlistSymbols.length * 2), true)
          : this.marketNewsService.getSuggestedNews(true),
        topPickSymbols.length
          ? this.marketNewsService.getNewsForSymbols(topPickSymbols, Math.max(10, topPickSymbols.length * 2), true)
          : Promise.resolve([])
      ]);

      this.suggestedNews = this.mergeNews(watchlistNews, topPickNews);
      this.message = this.suggestedNews.length ? 'Latest market news refreshed.' : 'No fresh market news found yet.';
      this.dashboardCacheService.saveSnapshot({
        watchSignals: this.watchSignals,
        suggestedNews: this.suggestedNews,
        aiSummary: this.aiSummary,
        aiWatchlistInsights: this.aiWatchlistInsights,
        aiTopPicks: this.aiTopPicks,
        topPicks: this.topPicks,
        message: this.message
      });
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Unable to refresh latest news right now.';
    } finally {
      this.newsLoading = false;
    }
  }

  private async runAiAnalysis(watchlistStocks?: Stock[]): Promise<void> {
    if (!this.aiApiKey) {
      this.openAiSettings('Add your Gemini API key to generate news-based stock picks.');
      this.aiLoading = false;
      this.analysisLoading = false;
      return;
    }

    this.aiLoading = true;
    this.analysisLoading = true;

    try {
      const universe = this.stockDataService.getUniverse();
      const activeWatchlistStocks =
        watchlistStocks ?? this.watchlistService.getWatchlistItems().map((item) => this.toWatchlistStock(item, universe));

      const result: AiAnalysisResult = await this.aiAnalysisService.analyzeNews({
        apiKey: this.aiApiKey,
        model: this.aiModel,
        news: this.suggestedNews,
        watchlist: activeWatchlistStocks
      });

      this.aiSummary = result.marketSummary;
      this.aiWatchlistInsights = result.watchlistInsights;
      this.aiTopPicks = result.topPicks;
      this.watchSignals = this.watchSignals.map((signal) => {
        const insight = this.getResolvedAiInsight(signal.stock.symbol);
        return insight
          ? {
              ...signal,
              action: insight.action,
              reason: insight.reason
            }
          : signal;
      });
      this.message = 'AI analysis updated from MarketAux/NewsAPI headlines.';
      this.dashboardCacheService.saveSnapshot({
        watchSignals: this.watchSignals,
        suggestedNews: this.suggestedNews,
        aiSummary: this.aiSummary,
        aiWatchlistInsights: this.aiWatchlistInsights,
        aiTopPicks: this.aiTopPicks,
        topPicks: this.topPicks,
        message: this.message
      });
    } catch (error) {
      this.aiSummary = '';
      this.aiWatchlistInsights = [];
      this.aiTopPicks = [];
      this.openAiSettings(error instanceof Error ? error.message : 'Unable to complete AI analysis.');
    } finally {
      this.aiLoading = false;
      this.analysisLoading = false;
    }
  }

  private async refreshNewWatchlistItem(symbol: string, companyName?: string): Promise<void> {
    this.refreshingSymbol = symbol;
    const universe = this.stockDataService.getUniverse();
    const watchlistItems = this.watchlistService.getWatchlistItems();
    const item = watchlistItems.find((entry) => this.normalizeSymbol(entry.symbol) === this.normalizeSymbol(symbol));
    if (!item) {
      this.refreshingSymbol = null;
      return;
    }

    const stock = this.toWatchlistStock(item, universe);

    try {
      const liveStock = await this.getLiveStockWithZeroRetry(
        stock.symbol,
        companyName ?? stock.companyName,
        stock.currentPrice === 0
      );
      const signal = this.signalService.getSignal(liveStock ?? stock);
      this.watchSignals = this.mergeSignals(this.watchSignals, [signal]);
      if (this.aiApiKey) {
        const symbolNews = await this.marketNewsService.getNewsForSymbols([stock.symbol], 5, true);
        const insight = await this.aiAnalysisService.analyzeWatchlistItem({
          apiKey: this.aiApiKey,
          model: this.aiModel,
          news: symbolNews,
          stock: liveStock ?? stock
        });

        this.aiWatchlistInsights = this.upsertInsight(this.aiWatchlistInsights, insight);
        this.watchSignals = this.watchSignals.map((itemSignal) =>
          this.normalizeSymbol(itemSignal.stock.symbol) === this.normalizeSymbol(stock.symbol)
            ? {
                ...itemSignal,
                action: insight.action,
                reason: insight.reason
              }
            : itemSignal
        );
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Unable to refresh the new watchlist item.';
    } finally {
      this.refreshingSymbol = null;
    }
  }

  private mergeSignals(existing: StockSignal[], incoming: StockSignal[]): StockSignal[] {
    const merged = [...existing];
    for (const signal of incoming) {
      const index = merged.findIndex((item) => this.normalizeSymbol(item.stock.symbol) === this.normalizeSymbol(signal.stock.symbol));
      if (index >= 0) {
        merged[index] = signal;
      } else {
        merged.push(signal);
      }
    }

    return merged;
  }

  private upsertInsight(existing: AiStockInsight[], incoming: AiStockInsight): AiStockInsight[] {
    const merged = [...existing];
    const index = merged.findIndex((item) => this.normalizeSymbol(item.symbol) === this.normalizeSymbol(incoming.symbol));
    if (index >= 0) {
      merged[index] = incoming;
    } else {
      merged.push(incoming);
    }

    return merged;
  }

  private mergeNews(primary: MarketNewsItem[], secondary: MarketNewsItem[]): MarketNewsItem[] {
    const seen = new Set<string>();
    const merged: MarketNewsItem[] = [];

    for (const item of [...primary, ...secondary]) {
      const key = `${item.title}|${item.url}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(item);
    }

    return merged;
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase().replace(/\.NS$/i, '').replace(/\.BO$/i, '');
  }

  private watchlistMatchesSignals(watchlistItems: WatchlistItem[]): boolean {
    if (!watchlistItems.length && !this.watchSignals.length) {
      return true;
    }

    const watchlistSymbols = new Set(watchlistItems.map((item) => this.normalizeSymbol(item.symbol)));
    const signalSymbols = new Set(this.watchSignals.map((signal) => this.normalizeSymbol(signal.stock.symbol)));

    if (watchlistSymbols.size !== signalSymbols.size) {
      return false;
    }

    for (const symbol of watchlistSymbols) {
      if (!signalSymbols.has(symbol)) {
        return false;
      }
    }

    return true;
  }

  private async getLiveStockWithZeroRetry(
    symbol: string,
    fallbackName?: string,
    retryWhenZero = false
  ): Promise<Stock | undefined> {
    const attempts = retryWhenZero ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const liveStock = await this.marketLookupService.getLiveStock(symbol, fallbackName);
      if (liveStock && liveStock.currentPrice > 0 && liveStock.dayChangePercent !== 0) {
        return liveStock;
      }

      if (liveStock && liveStock.currentPrice > 0) {
        return liveStock;
      }

      if (attempt < attempts - 1) {
        await this.delay(300 * (attempt + 1));
      }
    }

    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toWatchlistStock(item: WatchlistItem, universe: ReturnType<StockDataService['getUniverse']>) {
    const normalized = this.normalizeSymbol(item.symbol);
    const matched = universe.find((stock) => this.normalizeSymbol(stock.symbol) === normalized);

    if (matched) {
      return {
        ...matched,
        symbol: item.symbol,
        companyName: item.companyName || matched.companyName
      };
    }

    return {
      symbol: item.symbol,
      companyName: item.companyName || item.symbol,
      exchange: 'NSE' as const,
      currentPrice: 0,
      dayChangePercent: 0,
      movingAverage20: 0,
      rsi: 50
    };
  }
}
