// BusinessTodo — the business page's "Still to do" (COACH-TOOLS-EASY, 2026-11-02): the unfinished steps, each a jump
// to its own card further down. lib/coach-tools/businessTodo.ts decides what is left.
import { Check, ChevronRight } from 'lucide-react';
import type { Dashboard } from '@/lib/coach-business/dashboard';
import { TODO_COPY, businessTodo } from '@/lib/coach-tools/businessTodo';

export function BusinessTodo({ d }: { d: Dashboard }) {
  const items = businessTodo(d);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" aria-labelledby="todo-h" data-business-todo={items.length}>
      <h2 id="todo-h" className="text-base font-black">{TODO_COPY.title}</h2>
      {items.length ? (
        <ol className="mt-2 flex flex-col">
          {items.map((t) => (
            <li key={t.id}>
              <a href={t.href} className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.06] py-2 text-[16px] text-white" data-todo={t.id}>
                <span>{t.text}</span><ChevronRight className="h-5 w-5 shrink-0 text-fel-dim" aria-hidden />
              </a>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 flex items-center gap-2 text-[16px] text-white/80"><Check className="h-5 w-5 text-fel-emerald" aria-hidden />{TODO_COPY.done}</p>}
    </section>
  );
}
