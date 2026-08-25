import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonList,
  IonListHeader,
  IonMenuToggle,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { homeOutline, homeSharp, informationCircleOutline, informationCircleSharp, pulseOutline, pulseSharp } from 'ionicons/icons';
import { StreamHealthService } from './services/stream-health.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonListHeader,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
  ],
})
export class AppComponent {
  public appPages = [
    { title: 'Home', url: '/home', icon: 'home' },
    { title: 'Stream Health', url: '/stream-health', icon: 'pulse' },
    { title: 'About', url: '/about', icon: 'information-circle' },
  ];

  constructor(streamHealthService: StreamHealthService) {
    addIcons({
      homeOutline,
      homeSharp,
      informationCircleOutline,
      informationCircleSharp,
      pulseOutline,
      pulseSharp,
    });
    streamHealthService.startPolling();
  }
}
