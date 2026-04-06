export interface Stock {
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  currentPrice: number;
  dayChangePercent: number;
  movingAverage20: number;
  rsi: number;
}

export interface StockSignal {
  stock: Stock;
  action: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  score: number;
}
