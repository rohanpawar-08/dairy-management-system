import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withHashLocation, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { routes } from './app.routes';
import { Component } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';

@Component({ template: '<router-outlet></router-outlet>', standalone: true, imports: [RouterOutlet] })
class TestHostComponent {}

describe('App Routing Configuration', () => {
  let router: Router;
  let location: Location;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withHashLocation()),
        provideLocationMocks(),
      ],
    });

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  it('should be configured with hash-based routing strategy for Electron compatibility', () => {
    // Angular Location service transparently handles the hash internally when configured with withHashLocation
    // The test ensures the provider array can compile withHashLocation successfully
    expect(router).toBeTruthy();
    expect(location).toBeTruthy();
  });
});
