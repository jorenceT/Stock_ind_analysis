export interface MarketSearchResult {
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  quoteType: string;
}
