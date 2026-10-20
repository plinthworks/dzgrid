// zone.js first, in a project of its own: it patches the context's globals (Promise, timers,
// events), which must never leak into the zoneless tests (packages/angular/test).
import 'zone.js';
import '../test/setup';
