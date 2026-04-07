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
  IonGrid,
  IonRow,
  IonCol,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { ProfitService, ProfitData } from '../services/profit.service';

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
    IonGrid,
    IonRow,
    IonCol,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  data: ProfitData = {
    normalProfit: null,
    normalCashout: null,
    normalStale: false,
    snowballProfit: null,
    snowballCashout: null,
    snowballStale: false,
    inplayProfit: null,
    inplayExpected: null,
    inplayStale: false,
    openStake: null,
    openAverageProfit: null,
    openLayValue: null,
    upcomingGBRaces: 0,
    lastUpdated: null,
  };

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
      });
  }

  handleRefresh(event: any) {
    this.profitService.fetchAll().subscribe(result => {
      this.data = result;
      event.target.complete();
    });
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
}
