import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface StatsData {
  profit: number | null;
  weekToDateProfit: number | null;
  cashoutValue: number | null;
  weekToDateCashoutValue: number | null;
  expectedProfit: number | null;
  weekToDateExpectedProfit: number | null;
  hourlyProfit: HourlyProfitPoint[];
  weekToDateHourlyProfit: HourlyProfitPoint[];
  stale: boolean;
}

export interface HourlyProfitPoint {
  bucket: string;
  profit: number | null;
}

export interface OpenPosition {
  LongShort: 'Long' | 'Short';
  LongStake: number;
  ShortStake: number;
  AverageProfit: number;
  LayValue: number;
  LayValueExclLargeSpread: number;
  Race: RaceData;
}

export interface RaceData {
  Date: Date | string;
  Venue: string;
  Country: string;
  Status?: string;
  Commission: number | null;
}

export interface ProfitData {
  normalProfit: number | null;
  normalWeekToDateProfit: number | null;
  normalCashout: number | null;
  normalWeekToDateCashout: number | null;
  normalHourlyProfit: HourlyProfitPoint[];
  normalWeekToDateHourlyProfit: HourlyProfitPoint[];
  normalStale: boolean;
  snowballProfit: number | null;
  snowballWeekToDateProfit: number | null;
  snowballCashout: number | null;
  snowballWeekToDateCashout: number | null;
  snowballHourlyProfit: HourlyProfitPoint[];
  snowballWeekToDateHourlyProfit: HourlyProfitPoint[];
  snowballStale: boolean;
  inplayProfit: number | null;
  inplayWeekToDateProfit: number | null;
  inplayExpected: number | null;
  inplayWeekToDateExpected: number | null;
  inplayHourlyProfit: HourlyProfitPoint[];
  inplayWeekToDateHourlyProfit: HourlyProfitPoint[];
  inplayStale: boolean;
  openStake: number | null;
  openAverageProfit: number | null;
  openLayValue: number | null;
  commissionPaidToday: number | null;
  commissionPaidThisWeek: number | null;
  upcomingGBRaces: number;
  totalGBRaces: number;
  upcomingGBVenues: number;
  totalGBVenues: number;
  lastUpdated: Date | null;
}

@Injectable({
  providedIn: 'root',
})
export class ProfitService {
  private readonly flutterbotBase = environment.flutterbotApiBase;
  private readonly snowballBase = environment.snowballApiBase;
  private readonly ukTimeZone = 'Europe/London';

  constructor(private http: HttpClient) {}

  private getUkDateParts(date = new Date()): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.ukTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    return { year: part('year'), month: part('month'), day: part('day') };
  }

  private formatDate({ year, month, day }: { year: number; month: number; day: number }): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private getToday(): string {
    return this.formatDate(this.getUkDateParts());
  }

  private getStartOfWeek(): string {
    const today = this.getUkDateParts();
    const ukCalendarDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const mondayBasedDay = (ukCalendarDate.getUTCDay() + 6) % 7;
    ukCalendarDate.setUTCDate(ukCalendarDate.getUTCDate() - mondayBasedDay);

    return this.formatDate({
      year: ukCalendarDate.getUTCFullYear(),
      month: ukCalendarDate.getUTCMonth() + 1,
      day: ukCalendarDate.getUTCDate(),
    });
  }

  /** Returns the actual UTC instant at the start of a UK calendar date. */
  private getUkMidnight(date: { year: number; month: number; day: number }): Date {
    const midnightAsUtc = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const ukParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.ukTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(midnightAsUtc);
    const part = (type: string) => Number(ukParts.find(item => item.type === type)?.value);
    const displayedAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    const ukOffsetMs = displayedAsUtc - midnightAsUtc.getTime();

    return new Date(midnightAsUtc.getTime() - ukOffsetMs);
  }

  private getStartOfUkWeek(): Date {
    const today = this.getUkDateParts();
    const ukCalendarDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    ukCalendarDate.setUTCDate(ukCalendarDate.getUTCDate() - ((ukCalendarDate.getUTCDay() + 6) % 7));

    return this.getUkMidnight({
      year: ukCalendarDate.getUTCFullYear(),
      month: ukCalendarDate.getUTCMonth() + 1,
      day: ukCalendarDate.getUTCDate(),
    });
  }

  private isRaceToday(raceDate: Date | string | null | undefined): boolean {
    if (!raceDate) {
      return false;
    }

    if (typeof raceDate === 'string') {
      return raceDate.slice(0, 10) === this.getToday();
    }

    return this.formatDate(this.getUkDateParts(raceDate)) === this.getToday();
  }

  private formatUtcQueryParam(date: Date): string {
    return `${date.toISOString().slice(0, 16)}Z`;
  }

  private parseDateHourSeries(payload: any): HourlyProfitPoint[] {
    const dateHour = payload?.DateHour;
    if (!dateHour) {
      return [];
    }

    const points: HourlyProfitPoint[] = [];

    if (Array.isArray(dateHour)) {
      for (const entry of dateHour) {
        const bucket = typeof entry?.Bucket === 'string' ? entry.Bucket : null;
        const profit = entry?.Net?.Profit;
        if (!bucket) {
          continue;
        }

        points.push({
          bucket,
          profit: typeof profit === 'number' ? profit : null,
        });
      }
    } else if (typeof dateHour === 'object') {
      for (const [key, value] of Object.entries<any>(dateHour)) {
        const bucket =
          typeof value?.Bucket === 'string'
            ? value.Bucket
            : typeof key === 'string'
              ? key
              : null;
        const profit = value?.Net?.Profit;

        if (!bucket) {
          continue;
        }

        points.push({
          bucket,
          profit: typeof profit === 'number' ? profit : null,
        });
      }
    }

    return points
      .filter(point => !Number.isNaN(Date.parse(point.bucket)))
      .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
  }

  private fetchStats(baseUrl: string, extraFilter: string, dateFrom: string, dateTo: string): Observable<StatsData> {
    const date = this.getToday();
    const weekStart = this.getStartOfWeek();
    const dsFilters = `{${extraFilter}Void: false}`;
    const url = `${baseUrl}/stats?df=${dateFrom}&dt=${dateTo}&groupings=["All","DateHour"]&dsFilters=${dsFilters}&specialFilters={}`;
    const weekToDateUrl = `${baseUrl}/stats?df=${weekStart}&dt=${date}&groupings=["All","DateHour"]&dsFilters=${dsFilters}&specialFilters={}`;

    return forkJoin({
      day: this.http.get<any>(url),
      week: this.http.get<any>(weekToDateUrl),
    }).pipe(
      map(({ day, week }: { day: any; week: any }) => {
        const dayNet = day?.All?.[0]?.Net;
        const weekNet = week?.All?.[0]?.Net;
        return {
          profit: dayNet?.Profit ?? null,
          weekToDateProfit: weekNet?.Profit ?? null,
          cashoutValue: dayNet?.CashoutValueExclLargeSpread ?? null,
          weekToDateCashoutValue: weekNet?.CashoutValueExclLargeSpread ?? null,
          expectedProfit: dayNet?.ExpectedProfit ?? null,
          weekToDateExpectedProfit: weekNet?.ExpectedProfit ?? null,
          hourlyProfit: this.parseDateHourSeries(day),
          weekToDateHourlyProfit: this.parseDateHourSeries(week),
          stale: false,
        };
      }),
      catchError(() =>
        of({
          profit: null,
          weekToDateProfit: null,
          cashoutValue: null,
          weekToDateCashoutValue: null,
          expectedProfit: null,
          weekToDateExpectedProfit: null,
          hourlyProfit: [],
          weekToDateHourlyProfit: [],
          stale: true,
        })
      )
    );
  }

  private fetchOpenBets(): Observable<{ openStake: number | null; openAverageProfit: number | null; openLayValue: number | null }> {
    const url = `${this.flutterbotBase}/open`;
    return this.http.get<OpenPosition[]>(url).pipe(
      map(bets => {
        if (!bets || !Array.isArray(bets)) {
          return { openStake: null, openAverageProfit: null, openLayValue: null };
        }

        const todaysBets = bets.filter(bet => this.isRaceToday(bet.Race?.Date));

        return todaysBets.reduce(
          (acc, bet) => {
            acc.openStake += bet.LongShort === 'Long' ? (bet.LongStake ?? 0) : (bet.ShortStake ?? 0);
            acc.openAverageProfit += bet.AverageProfit ?? 0;
            acc.openLayValue += bet.LayValueExclLargeSpread ?? 0;
            return acc;
          },
          { openStake: 0, openAverageProfit: 0, openLayValue: 0 }
        );
      }),
      catchError(() => of({ openStake: null, openAverageProfit: null, openLayValue: null }))
    );
  }

  private fetchUpcomingRaces(): Observable<{
    upcomingGBRaces: number;
    totalGBRaces: number;
    upcomingGBVenues: number;
    totalGBVenues: number;
  }> {
    const now = new Date();
    const ukToday = this.getUkDateParts(now);
    const nextUkDay = new Date(Date.UTC(ukToday.year, ukToday.month - 1, ukToday.day + 1));
    const endOfUkDay = this.getUkMidnight({
      year: nextUkDay.getUTCFullYear(),
      month: nextUkDay.getUTCMonth() + 1,
      day: nextUkDay.getUTCDate(),
    });

    const startOfUkDay = this.getUkMidnight(ukToday);
    const dateFromString = this.formatUtcQueryParam(startOfUkDay);
    const dateToString = this.formatUtcQueryParam(endOfUkDay);

    const url = `${this.flutterbotBase}/races?df=${encodeURIComponent(dateFromString)}&dt=${encodeURIComponent(dateToString)}`;

    return this.http.get<RaceData[]>(url).pipe(
      map(races => {
        if (!races || !Array.isArray(races)) {
          return { upcomingGBRaces: 0, totalGBRaces: 0, upcomingGBVenues: 0, totalGBVenues: 0 };
        }

        const gbRaces = races.filter(race => race.Country === 'GB');
        const upcomingGBRaces = gbRaces.filter(race => race.Status === 'Open');
        const getDistinctVenueCount = (raceRows: RaceData[]) => new Set(
          raceRows
            .map(race => race.Venue?.trim())
            .filter((venue): venue is string => Boolean(venue))
        ).size;
        const upcomingGBVenues = getDistinctVenueCount(upcomingGBRaces);
        const totalGBVenues = getDistinctVenueCount(gbRaces);

        return {
          upcomingGBRaces: upcomingGBRaces.length,
          totalGBRaces: gbRaces.length,
          upcomingGBVenues,
          totalGBVenues,
        };
      }),
      catchError(() => of({ upcomingGBRaces: 0, totalGBRaces: 0, upcomingGBVenues: 0, totalGBVenues: 0 }))
    );
  }

  private fetchCommissionPaidTodayForBase(baseUrl: string): Observable<number | null> {
    const now = new Date();
    const startOfUkDay = this.getUkMidnight(this.getUkDateParts(now));

    const dateFromString = this.formatUtcQueryParam(startOfUkDay);
    const dateToString = this.formatUtcQueryParam(now);

    const url = `${baseUrl}/races?df=${encodeURIComponent(dateFromString)}&dt=${encodeURIComponent(dateToString)}`;

    return this.http.get<RaceData[]>(url).pipe(
      map(races => {
        if (!races || !Array.isArray(races)) {
          return 0;
        }

        return races.reduce((total, race) => total + (race.Commission ?? 0), 0);
      }),
      catchError(() => of(null))
    );
  }

  private fetchCommissionPaidThisWeekForBase(baseUrl: string): Observable<number | null> {
    const now = new Date();
    const startOfWeek = this.getStartOfUkWeek();

    const dateFromString = this.formatUtcQueryParam(startOfWeek);
    const dateToString = this.formatUtcQueryParam(now);

    const url = `${baseUrl}/races?df=${encodeURIComponent(dateFromString)}&dt=${encodeURIComponent(dateToString)}`;

    return this.http.get<RaceData[]>(url).pipe(
      map(races => {
        if (!races || !Array.isArray(races)) {
          return 0;
        }

        return races.reduce((total, race) => total + (race.Commission ?? 0), 0);
      }),
      catchError(() => of(null))
    );
  }

  private fetchCommissionPaidToday(): Observable<number | null> {
    return forkJoin({
      flutterbot: this.fetchCommissionPaidTodayForBase(this.flutterbotBase),
      snowball: this.fetchCommissionPaidTodayForBase(this.snowballBase),
    }).pipe(
      map(({ flutterbot, snowball }) => {
        if (flutterbot === null && snowball === null) {
          return null;
        }
        return (flutterbot ?? 0) + (snowball ?? 0);
      })
    );
  }

  private fetchCommissionPaidThisWeek(): Observable<number | null> {
    return forkJoin({
      flutterbot: this.fetchCommissionPaidThisWeekForBase(this.flutterbotBase),
      snowball: this.fetchCommissionPaidThisWeekForBase(this.snowballBase),
    }).pipe(
      map(({ flutterbot, snowball }) => {
        if (flutterbot === null && snowball === null) {
          return null;
        }
        return (flutterbot ?? 0) + (snowball ?? 0);
      })
    );
  }


  fetchAll(): Observable<ProfitData> {
    const today = this.getToday();
    return forkJoin({
      normal: this.fetchStats(this.flutterbotBase, '', today, today),
      snowball: this.fetchStats(this.snowballBase, '', today, today),
      inplay: this.fetchStats(this.flutterbotBase, 'InPlay: true, ', today, today),
      open: this.fetchOpenBets(),
      commissionPaidToday: this.fetchCommissionPaidToday(),
      commissionPaidThisWeek: this.fetchCommissionPaidThisWeek(),
      upcomingRaces: this.fetchUpcomingRaces(),
    }).pipe(
      map(({ normal, snowball, inplay, open, commissionPaidToday, commissionPaidThisWeek, upcomingRaces }) => ({
        normalProfit: normal.profit,
        normalWeekToDateProfit: normal.weekToDateProfit,
        normalCashout: normal.cashoutValue,
        normalWeekToDateCashout: normal.weekToDateCashoutValue,
        normalHourlyProfit: normal.hourlyProfit,
        normalWeekToDateHourlyProfit: normal.weekToDateHourlyProfit,
        normalStale: normal.stale,
        snowballProfit: snowball.profit,
        snowballWeekToDateProfit: snowball.weekToDateProfit,
        snowballCashout: snowball.cashoutValue,
        snowballWeekToDateCashout: snowball.weekToDateCashoutValue,
        snowballHourlyProfit: snowball.hourlyProfit,
        snowballWeekToDateHourlyProfit: snowball.weekToDateHourlyProfit,
        snowballStale: snowball.stale,
        inplayProfit: inplay.profit,
        inplayWeekToDateProfit: inplay.weekToDateProfit,
        inplayExpected: inplay.expectedProfit,
        inplayWeekToDateExpected: inplay.weekToDateExpectedProfit,
        inplayHourlyProfit: inplay.hourlyProfit,
        inplayWeekToDateHourlyProfit: inplay.weekToDateHourlyProfit,
        inplayStale: inplay.stale,
        openStake: open.openStake,
        openAverageProfit: open.openAverageProfit,
        openLayValue: open.openLayValue,
        commissionPaidToday,
        commissionPaidThisWeek,
        upcomingGBRaces: upcomingRaces.upcomingGBRaces,
        totalGBRaces: upcomingRaces.totalGBRaces,
        upcomingGBVenues: upcomingRaces.upcomingGBVenues,
        totalGBVenues: upcomingRaces.totalGBVenues,
        lastUpdated: new Date(),
      }))
    );
  }
}
