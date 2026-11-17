"use client";

import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";

function syncSelectAll(root: HTMLDivElement | null, selectAll: HTMLInputElement | null) {
  if (!root || !selectAll) return;
  const choices = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="serviceIds"]'));
  const selectedCount = choices.filter((choice) => choice.checked).length;
  selectAll.checked = choices.length > 0 && selectedCount === choices.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < choices.length;
}

export function SelectAllServices({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const selectAll = selectAllRef.current;
    const form = selectAll?.form;
    if (!root || !selectAll || !form) return;

    const handleChoiceChange = (event: Event) => {
      if (event.target !== selectAll) syncSelectAll(root, selectAll);
    };
    form.addEventListener("change", handleChoiceChange);
    syncSelectAll(root, selectAll);
    return () => form.removeEventListener("change", handleChoiceChange);
  }, []);

  function handleSelectAll(event: ChangeEvent<HTMLInputElement>) {
    const selectAll = event.currentTarget;
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLInputElement>('input[name="serviceIds"]').forEach((choice) => {
      choice.checked = selectAll.checked;
    });
    syncSelectAll(root, selectAll);
  }

  return (
    <div className="dealer-unbilled-picker" ref={rootRef}>
      <label className="dealer-select-all">
        <input ref={selectAllRef} type="checkbox" onChange={handleSelectAll} />
        <span>Select all listed services</span>
      </label>
      {children}
    </div>
  );
}
