import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import {
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { StreamHealthData, StreamHealthService } from '../services/stream-health.service';

@Component({
  selector: 'app-stream-health',
  templateUrl: './stream-health.page.html',
  styleUrls: ['./stream-health.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonRefresher,
    IonRefresherContent,
    IonTitle,
    IonToolbar,
  ],
})
export class StreamHealthPage implements OnInit, OnDestroy {
  data: StreamHealthData = {
    updatesPerMinute: null,
    analysesPerMinute: null,
    analysesPerMcmPercent: null,
    analysisLatencyMs: null,
    windowMinutes: 15,
    unavailable: false,
  };
  hourData: StreamHealthData = {
    updatesPerMinute: null,
    analysesPerMinute: null,
    analysesPerMcmPercent: null,
    analysisLatencyMs: null,
    windowMinutes: 60,
    unavailable: false,
  };
  lastUpdated: Date | null = null;
  private pollSub?: Subscription;

  constructor(private streamHealthService: StreamHealthService) {}

  ngOnInit(): void {
    this.pollSub = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.fetchMetrics())
    ).subscribe(({ quarterHour, hour }) => {
      this.data = quarterHour;
      this.hourData = hour;
      this.lastUpdated = new Date();
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  handleRefresh(event: CustomEvent): void {
    this.fetchMetrics().subscribe(({ quarterHour, hour }) => {
      this.data = quarterHour;
      this.hourData = hour;
      this.lastUpdated = new Date();
      (event.target as HTMLIonRefresherElement).complete();
    });
  }

  formatRate(value: number | null): string {
    return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  formatLatency(value: number | null): string {
    if (value === null) return '—';
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
    return `${Math.round(value)} ms`;
  }

  formatPercent(value: number | null): string {
    return value === null ? 'â€”' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  formatTime(value: Date | null): string {
    if (!value) return '—';
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private fetchMetrics() {
    return forkJoin({
      quarterHour: this.streamHealthService.fetch(15),
      hour: this.streamHealthService.fetch(60),
    });
  }
}
