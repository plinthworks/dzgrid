/**
 * @dzgrid/angular — DzGrid for Angular (Phase 3 step 22, docs/behaviors/angular-parts.md):
 * `<dz-grid>`, its controller, parts as components and templates, the search and export
 * directives, `provideDzGrid` and `fromObservable`.
 */
export { DZGRID_ANGULAR_VERSION } from './version';
export { DzGrid } from './grid';
export { DzgController } from './controller';
export { DzgPart } from './dzg-part';
export { componentPart } from './component-part';
export { DzgSearch } from './search';
export { DzgExport } from './export';
export { fromObservable, type ObservableLike } from './from-observable';
export { DZG_DEFAULTS, DZG_ENV, DZG_MESSAGES, DZG_PARTS, provideDzGrid, type DzGridConfig, type DzGridDefaults } from './providers';
export type { DzgCell, DzgPartComponent, DzgPartContext, DzgTemplateContext, WiredSlot } from './part-bind';
