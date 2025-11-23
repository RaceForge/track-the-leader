import type { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: 'viewer',
		loadComponent: () =>
			import('./race-viewer/race-viewer').then((m) => m.RaceViewer),
	},
	{
		path: '',
		redirectTo: 'viewer',
		pathMatch: 'full',
	},
];
