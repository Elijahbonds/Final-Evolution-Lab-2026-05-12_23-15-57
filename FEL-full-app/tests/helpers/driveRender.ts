// Press a component's buttons in a test that has no DOM.
//
// vitest runs in node here (no jsdom), so a test can render a component to a string but cannot click anything. This
// helper calls the component as a plain function INSIDE a host component's render, so the component's hooks belong to
// the host. A handler called during that render (a tab click, typing in a field, a synchronous LIST IT) is a
// render-phase update of the same component, which React supports: it re-renders the host with the new state before
// returning. A handler called after the render has finished (drive(...).tree) changes no state, since there is nothing
// mounted to update, but its side effects still run for real: localStorage writes, the checkout it calls, the fetch.
//
// So a test can walk the real UI into a state (steps), read what it says (html), and then press an async button on the
// final tree and check what that button actually did.

import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type AnyProps = Record<string, any>;
export interface Found { type: unknown; props: AnyProps }

/** The visible text of a React node: its strings and numbers, depth first. */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as AnyProps).children);
  return '';
}

/** Every element in a tree (the component's own JSX, not the insides of child components) matching `pred`. */
export function findAll(node: ReactNode, pred: (el: Found) => boolean, out: Found[] = []): Found[] {
  if (Array.isArray(node)) { for (const n of node) findAll(n, pred, out); return out; }
  if (!isValidElement(node)) return out;
  const el: Found = { type: node.type, props: node.props as AnyProps };
  if (pred(el)) out.push(el);
  findAll(el.props.children, pred, out);
  return out;
}

/** The one <button> whose text matches. Throws when there is none or more than one, so a test never presses a guess. */
export function button(tree: ReactNode, label: RegExp): Found {
  const hits = findAll(tree, (el) => el.type === 'button' && label.test(textOf(el.props.children)));
  if (hits.length !== 1) throw new Error(`expected one button matching ${label}, found ${hits.length}`);
  return hits[0];
}

/** Every <button> whose text matches. */
export function buttons(tree: ReactNode, label: RegExp): Found[] {
  return findAll(tree, (el) => el.type === 'button' && label.test(textOf(el.props.children)));
}

/** The one <input>/<textarea> whose placeholder matches. */
export function field(tree: ReactNode, placeholder: RegExp): Found {
  const hits = findAll(tree, (el) => (el.type === 'input' || el.type === 'textarea') && placeholder.test(String(el.props.placeholder ?? '')));
  if (hits.length !== 1) throw new Error(`expected one field matching ${placeholder}, found ${hits.length}`);
  return hits[0];
}

/** Type into a field found with `field`. */
export function typeInto(el: Found, value: string): void {
  el.props.onChange({ target: { value } });
}

/** A step runs against the tree of one render pass and must change state synchronously (a click, a keystroke). */
export type Step = (tree: ReactElement) => void;

/**
 * Render `render()` (which calls the component as a function, e.g. `() => KitchenHub({})`), running `steps` one per
 * render pass. Returns the final markup and the final tree. Throws if a step changed no state, because then the steps
 * after it never ran and the markup would describe a state the test did not reach.
 */
export function drive(render: () => ReactElement, steps: Step[] = []): { html: string; tree: ReactElement } {
  let next = 0;
  let tree: ReactElement | null = null;
  function Host(): ReactElement {
    tree = render();
    if (next < steps.length) steps[next++](tree);
    return tree;
  }
  const html = renderToStaticMarkup(createElement(Host));
  if (next < steps.length) throw new Error(`drive: step ${next} changed no state, so ${steps.length - next} step(s) never ran`);
  return { html, tree: tree! };
}

/** Let promise chains started by a handler (a checkout, a localStorage write after an await) settle. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
