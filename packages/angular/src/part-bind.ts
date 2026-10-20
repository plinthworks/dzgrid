import { TemplateRef, createComponent, type ApplicationRef, type EnvironmentInjector, type Injector, type InputSignal, type Type } from '@angular/core';
import type { GridKernel } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { SlotContext, SlotPart } from '@dzgrid/dom';

export type WiredSlot = keyof SlotContext;

/** What an Angular part receives: its slot's context, and `emit` (step 22, owner Q1). */
export type DzgPartContext<S extends WiredSlot = 'cell'> = SlotContext[S] & {
  /**
   * Sends a grid event as the user: `cellAction { column, key, name, detail }` from a cell (the
   * row it shows at the call), `partAction { slot, column, name, detail }` from any other slot.
   */
  emit(name: string, detail?: unknown): void;
};

/** A component drawing a slot: its whole context in one signal input named `cell` (owner Q2). */
export interface DzgPartComponent<S extends WiredSlot = 'cell'> {
  readonly cell: InputSignal<DzgPartContext<S>>;
  /** The grid asks it to take the focus (Enter, F2); without it, the first tabbable element inside. */
  focus?(): boolean;
}

/** A cell component. */
export type DzgCell = DzgPartComponent<'cell'>;

/** What a template part's `let-` names: the context, also as `cell`. */
export interface DzgTemplateContext<S extends WiredSlot = 'cell'> {
  $implicit: DzgPartContext<S>;
  cell: DzgPartContext<S>;
}

/** A registry entry made by `componentPart`, or a template's: what `<dz-grid>` binds to itself. */
export const MARKS = new WeakMap<object, Type<unknown> | TemplateRef<unknown>>();

/** What a bound part reaches: the application, the grid's element injector, its kernel. */
export interface Bindings {
  readonly env: EnvironmentInjector;
  readonly app: ApplicationRef;
  readonly injector: Injector;
  kernel(): GridKernel<any, any> | null;
}

/** What the focus fallback may take: tabbable, neither disabled nor a hidden input. */
const TABBABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'
  .split(',')
  .map((q) => `${q}:not(:disabled):not([type=hidden])`)
  .join();

/**
 * A component or a template as a part of one grid (S6's pool): created once per host, its view
 * attached to the application and checked once; rebound in place (a new `cell`, that view
 * checked alone); destroyed with its nodes. A throw while mounting leaves nothing behind.
 */
export function boundPart<S extends WiredSlot>(b: Bindings, slot: S, what: Type<unknown> | TemplateRef<unknown>): SlotPart<S> {
  return {
    slot,
    part: {
      mount(host, c) {
        let cur: SlotContext[WiredSlot] = c;
        const send = (name: string, detail?: unknown): void => {
          const k = b.kernel();
          const column = (cur as { column?: { id: string } }).column?.id ?? null;
          if (k) emit(k, slot === 'cell' ? { type: 'cellAction', source: 'user', column: column!, key: (cur as SlotContext['cell']).key, name, detail } : { type: 'partAction', source: 'user', slot, column, name, detail });
        };
        const ctx = (x: SlotContext[S]): DzgPartContext<WiredSlot> => ({ ...x, emit: send }) as never;
        let nodes: () => Node[];
        let set: (x: ReturnType<typeof ctx>) => void;
        let check: () => void;
        let drop: () => void;
        let focus: (() => boolean) | undefined;
        if (what instanceof TemplateRef) {
          const first = ctx(c);
          const view = (what as TemplateRef<DzgTemplateContext<WiredSlot>>).createEmbeddedView({ $implicit: first, cell: first }, b.injector);
          nodes = () => view.rootNodes;
          set = (x) => void (view.context.$implicit = view.context.cell = x);
          check = () => view.detectChanges();
          drop = () => view.destroy();
          b.app.attachView(view);
        } else {
          const ref = createComponent(what, { environmentInjector: b.env, elementInjector: b.injector });
          const inst = ref.instance as Partial<DzgPartComponent<S>>;
          const el: Node = ref.location.nativeElement;
          nodes = () => [el];
          set = (x) => ref.setInput('cell', x);
          check = () => ref.changeDetectorRef.detectChanges();
          drop = () => ref.destroy();
          focus = inst.focus && (() => inst.focus!());
          b.app.attachView(ref.hostView);
        }
        const destroy = (): void => {
          drop();
          for (const n of nodes()) (n as ChildNode).remove();
        };
        try {
          set(ctx(c));
          host.append(...nodes());
          check();
        } catch (err) {
          destroy();
          throw err;
        }
        return {
          update(n) {
            cur = n;
            set(ctx(n));
            check();
          },
          destroy,
          focus: () => {
            if (focus) return focus();
            for (const n of nodes()) {
              const el = n.nodeType === 1 ? (n as Element) : null;
              const t = el?.matches(TABBABLE) ? el : el?.querySelector(TABBABLE);
              if (t) return (t as HTMLElement).focus(), true;
            }
            return false;
          },
        };
      },
    },
  };
}
