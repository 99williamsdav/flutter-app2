import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, forkJoin, Observable, of, Subscription, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface StreamHealthData {
  updatesPerMinute: number | null;
  analysesPerMinute: number | null;
  analysesPerMcmPercent: number | null;
  analysisLatencyMs: number | null;
  windowMinutes: number;
  unavailable: boolean;
}

export interface StreamHealthSnapshot {
  quarterHour: StreamHealthData;
  hour: StreamHealthData;
  updatedAt: Date;
}

@Injectable({ providedIn: 'root' })
export class StreamHealthService {
  private readonly snapshotSubject = new BehaviorSubject<StreamHealthSnapshot | null>(null);
  private pollingSub?: Subscription;

  readonly snapshot$ = this.snapshotSubject.asObservable();

  constructor(private http: HttpClient) {}

  startPolling(): void {
    if (this.pollingSub) return;

    this.pollingSub = timer(0, 10000).pipe(
      switchMap(() => this.refresh())
    ).subscribe();
  }

  refresh(): Observable<StreamHealthSnapshot> {
    return forkJoin({
      quarterHour: this.fetch(15),
      hour: this.fetch(60),
    }).pipe(
      map(metrics => ({ ...metrics, updatedAt: new Date() })),
      map(snapshot => {
        this.snapshotSubject.next(snapshot);
        return snapshot;
      })
    );
  }

  fetch(minutes = 15): Observable<StreamHealthData> {
    const endpoint = `${environment.flutterbotApiBase}/stream-health?minutes=${minutes}`;

    return this.http.get<Record<string, unknown>>(endpoint).pipe(
      map(payload => {
        const summary = this.objectFrom(payload, 'summary');
        const receivedCount = this.numberFrom(summary, ['receivedCount']);
        const analysisCount = this.numberFrom(summary, ['analysisCount']);

        return {
          updatesPerMinute: this.numberFrom(summary, [
            'receivedPerMinute',
            'updatesPerMinute', 'updatesReceivedPerMinute', 'receivedUpdatesPerMinute', 'updates_per_minute',
          ]) ?? this.numberFrom(payload, [
            'updatesPerMinute', 'updatesReceivedPerMinute', 'receivedUpdatesPerMinute', 'updates_per_minute',
          ]),
          analysesPerMinute: this.numberFrom(summary, [
            'analysesPerMinute', 'analysisPerMinute', 'analysesCompletedPerMinute', 'analyses_per_minute',
          ]) ?? this.numberFrom(payload, [
            'analysesPerMinute', 'analysisPerMinute', 'analysesCompletedPerMinute', 'analyses_per_minute',
          ]),
          analysesPerMcmPercent: receivedCount && analysisCount !== null
            ? (analysisCount / receivedCount) * 100
            : null,
          analysisLatencyMs: this.numberFrom(summary, [
            'analysisLatencyMs', 'averageAnalysisLatencyMs', 'avgAnalysisLatencyMs', 'analysis_latency_ms',
            'analysisLatencyMilliseconds', 'averageAnalysisLatencyMilliseconds', 'avgAnalysisLatencyMilliseconds',
          ]) ?? this.numberFrom(payload, [
            'analysisLatencyMs', 'averageAnalysisLatencyMs', 'avgAnalysisLatencyMs', 'analysis_latency_ms',
            'analysisLatencyMilliseconds', 'averageAnalysisLatencyMilliseconds', 'avgAnalysisLatencyMilliseconds',
          ]),
          windowMinutes: this.numberFrom(payload, ['windowMinutes', 'minutes']) ?? minutes,
          unavailable: false,
        };
      }),
      catchError(() => of({
        updatesPerMinute: null,
        analysesPerMinute: null,
        analysesPerMcmPercent: null,
        analysisLatencyMs: null,
        windowMinutes: minutes,
        unavailable: true,
      }))
    );
  }

  private numberFrom(payload: Record<string, unknown>, names: string[]): number | null {
    for (const name of names) {
      const matchingKey = Object.keys(payload).find(key => key.toLowerCase() === name.toLowerCase());
      const value = matchingKey ? payload[matchingKey] : undefined;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return null;
  }

  private objectFrom(payload: Record<string, unknown>, name: string): Record<string, unknown> {
    const matchingKey = Object.keys(payload).find(key => key.toLowerCase() === name.toLowerCase());
    const value = matchingKey ? payload[matchingKey] : undefined;
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }
}
