import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { HourlyProfitPoint, ProfitService, ProfitData } from '../services/profit.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonMenuButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  activeView: 'today' | 'week' = 'today';
  private touchStartX: number | null = null;

  data: ProfitData = {
    normalProfit: null,
    normalWeekToDateProfit: null,
    normalCashout: null,
    normalWeekToDateCashout: null,
    normalHourlyProfit: [],
    normalWeekToDateHourlyProfit: [],
    normalStale: false,
    snowballProfit: null,
    snowballWeekToDateProfit: null,
    snowballCashout: null,
    snowballWeekToDateCashout: null,
    snowballHourlyProfit: [],
    snowballWeekToDateHourlyProfit: [],
    snowballStale: false,
    inplayProfit: null,
    inplayWeekToDateProfit: null,
    inplayExpected: null,
    inplayWeekToDateExpected: null,
    inplayHourlyProfit: [],
    inplayWeekToDateHourlyProfit: [],
    inplayStale: false,
    openStake: null,
    openAverageProfit: null,
    openLayValue: null,
    commissionPaidToday: null,
    commissionPaidThisWeek: null,
    upcomingGBRaces: 0,
    lastUpdated: null,
  };

  todayGrossSparklinePoints: HourlyProfitPoint[] = [];
  weekGrossSparklinePoints: HourlyProfitPoint[] = [];
  todayGrossSparklinePath = '';
  weekGrossSparklinePath = '';
  todayGrossBaselineY: number | null = null;
  weekGrossBaselineY: number | null = null;

  private pollSub?: Subscription;

  constructor(private profitService: ProfitService) {}

  ngOnInit() {
    this.startPolling();
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  private startPolling() {
    this.pollSub = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.profitService.fetchAll())
      )
      .subscribe(result => {
        this.data = result;
        this.rebuildGrossSparklines();
      });
  }

  handleRefresh(event: any) {
    this.profitService.fetchAll().subscribe(result => {
      this.data = result;
      this.rebuildGrossSparklines();
      event.target.complete();
    });
  }

  private mergeGrossSeries(...seriesList: HourlyProfitPoint[][]): HourlyProfitPoint[] {
    const totalsByBucket = new Map<string, number>();

    for (const series of seriesList) {
      if (!Array.isArray(series)) {
        continue;
      }

      for (const point of series) {
        if (!point?.bucket || typeof point.profit !== 'number') {
          continue;
        }

        totalsByBucket.set(point.bucket, (totalsByBucket.get(point.bucket) ?? 0) + point.profit);
      }
    }

    return [...totalsByBucket.entries()]
      .map(([bucket, profit]) => ({ bucket, profit }))
      .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
  }

  private calculateBaselineY(points: HourlyProfitPoint[], height = 28): number | null {
    const values = points
      .map(point => point.profit)
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) {
      return null;
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    if (maxValue === minValue) {
      return height / 2;
    }

    if (0 <= minValue) {
      return height;
    }

    if (0 >= maxValue) {
      return 0;
    }

    const ratio = (0 - minValue) / (maxValue - minValue);
    return height - ratio * height;
  }

  private buildSparklinePath(points: HourlyProfitPoint[], width = 100, height = 28): string {
    const validPoints = points
      .map(point => {
        const timestamp = Date.parse(point.bucket);
        if (Number.isNaN(timestamp) || typeof point.profit !== 'number') {
          return null;
        }

        return {
          timestamp,
          profit: point.profit,
        };
      })
      .filter((point): point is { timestamp: number; profit: number } => point !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (validPoints.length < 2) {
      return '';
    }

    const timestamps = validPoints.map(point => point.timestamp);
    const values = validPoints.map(point => point.profit);

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const xAt = (timestamp: number): number => {
      if (maxTimestamp === minTimestamp) {
        return 0;
      }

      return ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * width;
    };

    const yAt = (value: number): number => {
      if (maxValue === minValue) {
        return height / 2;
      }

      return height - ((value - minValue) / (maxValue - minValue)) * height;
    };

    const gapThresholdMs = 90 * 60 * 1000;
    let path = '';

    for (let i = 0; i < validPoints.length; i++) {
      const point = validPoints[i];
      const x = xAt(point.timestamp).toFixed(2);
      const y = yAt(point.profit).toFixed(2);

      if (i === 0) {
        path += `M${x} ${y}`;
        continue;
      }

      const previous = validPoints[i - 1];
      const hasLargeGap = point.timestamp - previous.timestamp > gapThresholdMs;

      if (hasLargeGap) {
        path += ` M${x} ${y}`;
      } else {
        path += ` L${x} ${y}`;
      }
    }

    return path;
  }

  private toCumulative(points: HourlyProfitPoint[]): HourlyProfitPoint[] {
    let running = 0;
    return points.map(point => {
      running += point.profit ?? 0;
      return { bucket: point.bucket, profit: running };
    });
  }

  private rebuildGrossSparklines(): void {
    const todayMerged = this.toCumulative(
      this.mergeGrossSeries(
        this.data.normalHourlyProfit,
        this.data.snowballHourlyProfit,
        this.data.inplayHourlyProfit
      )
    );
    const weekMerged = this.toCumulative(
      this.mergeGrossSeries(
        this.data.normalWeekToDateHourlyProfit,
        this.data.snowballWeekToDateHourlyProfit,
        this.data.inplayWeekToDateHourlyProfit
      )
    );

    this.todayGrossSparklinePoints = todayMerged;
    this.weekGrossSparklinePoints = weekMerged;

    this.todayGrossSparklinePath = this.buildSparklinePath(todayMerged);
    this.weekGrossSparklinePath = this.buildSparklinePath(weekMerged);

    this.todayGrossBaselineY = this.calculateBaselineY(todayMerged);
    this.weekGrossBaselineY = this.calculateBaselineY(weekMerged);
  }

  handleTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  handleTouchEnd(event: TouchEvent) {
    const touchEndX = event.changedTouches[0]?.clientX;
    if (this.touchStartX === null || touchEndX === undefined) {
      return;
    }

    const swipeDelta = touchEndX - this.touchStartX;
    const minSwipeDistance = 45;

    if (Math.abs(swipeDelta) < minSwipeDistance) {
      this.touchStartX = null;
      return;
    }

    this.activeView = swipeDelta < 0 ? 'week' : 'today';
    this.touchStartX = null;
  }

  formatCurrency(value: number | null, includePositiveSign = false): string {
    if (value === null || value === undefined) return '£--.--';
    const abs = Math.abs(value);
    const formatted = abs.toFixed(2);

    if (value < 0) {
      return `-£${formatted}`;
    }

    if (includePositiveSign && value > 0) {
      return `+£${formatted}`;
    }

    return `£${formatted}`;
  }

  formatTime(date: Date | null): string {
    if (!date) return '--:--';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  get grossTotal(): number | null {
    const p = this.data;
    if (p.normalProfit === null && p.snowballProfit === null && p.inplayProfit === null) return null;
    return (p.normalProfit ?? 0) + (p.snowballProfit ?? 0) + (p.inplayProfit ?? 0);
  }

  get grossWeekToDateTotal(): number | null {
    const p = this.data;
    if (p.normalWeekToDateProfit === null && p.snowballWeekToDateProfit === null && p.inplayWeekToDateProfit === null) return null;
    return (p.normalWeekToDateProfit ?? 0) + (p.snowballWeekToDateProfit ?? 0) + (p.inplayWeekToDateProfit ?? 0);
  }
}
