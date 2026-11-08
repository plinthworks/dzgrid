// A partial-compiled Angular service, as ng-packagr ships one (fesm2022): its class metadata is for
// TestBed only, which an Angular production build links and drops.
import * as i0 from '@angular/core';
import { Injectable } from '@angular/core';

class DzgFixtureService {
    greet() { return 'dzg-fixture-greet'; }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.25", ngImport: i0, type: DzgFixtureService, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.2.25", ngImport: i0, type: DzgFixtureService }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.25", ngImport: i0, type: DzgFixtureService, decorators: [{
            type: Injectable,
            args: [{ providedIn: 'dzg-fixture-testbed-only' }]
        }] });

export { DzgFixtureService };
