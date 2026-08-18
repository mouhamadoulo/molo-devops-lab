import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthStore } from './core/auth/auth.store';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AuthStore, useValue: { restoring: signal(false) } }]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
