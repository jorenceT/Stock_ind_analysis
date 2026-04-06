import { Injectable } from '@angular/core';
import { Stock } from '../models/stock.model';

@Injectable({
  providedIn: 'root'
})
export class StockDataService {
  private readonly sampleStocks: Stock[] = [
    { symbol: 'RELIANCE', companyName: 'Reliance Industries', exchange: 'NSE', currentPrice: 2950, dayChangePercent: 1.2, movingAverage20: 2875, rsi: 58 },
    { symbol: 'TCS', companyName: 'Tata Consultancy Services', exchange: 'NSE', currentPrice: 4050, dayChangePercent: -0.4, movingAverage20: 3985, rsi: 52 },
    { symbol: 'HDFCBANK', companyName: 'HDFC Bank', exchange: 'NSE', currentPrice: 1710, dayChangePercent: 0.9, movingAverage20: 1668, rsi: 56 },
    { symbol: 'INFY', companyName: 'Infosys', exchange: 'NSE', currentPrice: 1595, dayChangePercent: -1.1, movingAverage20: 1622, rsi: 44 },
    { symbol: 'ICICIBANK', companyName: 'ICICI Bank', exchange: 'NSE', currentPrice: 1215, dayChangePercent: 1.4, movingAverage20: 1178, rsi: 61 },
    { symbol: 'LT', companyName: 'Larsen & Toubro', exchange: 'NSE', currentPrice: 3790, dayChangePercent: 0.8, movingAverage20: 3650, rsi: 63 },
    { symbol: 'BHARTIARTL', companyName: 'Bharti Airtel', exchange: 'NSE', currentPrice: 1338, dayChangePercent: 1.6, movingAverage20: 1264, rsi: 65 },
    { symbol: 'ITC', companyName: 'ITC Limited', exchange: 'NSE', currentPrice: 455, dayChangePercent: -0.2, movingAverage20: 449, rsi: 50 },
    { symbol: 'SUNPHARMA', companyName: 'Sun Pharma', exchange: 'NSE', currentPrice: 1622, dayChangePercent: 1.1, movingAverage20: 1548, rsi: 60 },
    { symbol: 'TATAMOTORS', companyName: 'Tata Motors', exchange: 'NSE', currentPrice: 981, dayChangePercent: 2.1, movingAverage20: 905, rsi: 67 }
  ];

  getUniverse(): Stock[] {
    return [...this.sampleStocks];
  }

  findBySymbol(symbol: string): Stock | undefined {
    return this.sampleStocks.find((stock) => stock.symbol.toLowerCase() === symbol.toLowerCase());
  }
}
