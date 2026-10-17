import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The package version, kept equal to package.json's by the toolchain test. */
export const DZGRID_ANGULAR_VERSION = '0.0.0';

/**
 * Renders its label through a real template binding, so the toolchain test
 * fails when templates stop compiling. Not part of the lasting API: it goes
 * when the real component lands (step 22).
 */
@Component({
  selector: 'dzg-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `DzGrid {{ label() }}`,
})
export class DzgProbe {
  readonly label = input('');
}
