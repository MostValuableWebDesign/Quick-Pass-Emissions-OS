"use client";

import { Plus, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { DirectoryAddDialogContext } from "./directory-add-dialog-context";

export function DirectoryAddDialog({ title, children }: { title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [formGeneration, setFormGeneration] = useState(0);

  return (
    <>
      <button
        type="button"
        className="button button-primary directory-add-trigger"
        onClick={() => {
          setFormGeneration((generation) => generation + 1);
          dialog.current?.showModal();
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {title}
      </button>
      <dialog
        ref={dialog}
        className="directory-add-dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="directory-add-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="directory-add-dialog-close"
            aria-label={`Close ${title.toLowerCase()} form`}
            onClick={() => dialog.current?.close()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <DirectoryAddDialogContext.Provider value={() => dialog.current?.close()}>
          <div className="directory-add-dialog-body" key={formGeneration}>
            {children}
          </div>
        </DirectoryAddDialogContext.Provider>
      </dialog>
    </>
  );
}
