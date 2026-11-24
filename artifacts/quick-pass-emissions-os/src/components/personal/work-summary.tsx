"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Check, MessageCircle } from "lucide-react";
import type { PersonalNoteView } from "@/modules/personal/types";
import type { Clarification, PolishOutput } from "@/modules/personal/polish-rules";
import "./work-summary.css";
export type PreparedNote = { id: string; version: number };
export type ReviewedSummary = {
  id: string;
  version: number;
  text: string;
  answers: Clarification[];
};
type Suggestion = PolishOutput & { noteId: string; version: number; original: string };
export function WorkSummaryEditor({
  note,
  readOnly,
  onPrepare,
  onSave,
}: {
  note: PersonalNoteView;
  readOnly: boolean;
  onPrepare: (id: string) => Promise<PreparedNote>;
  onSave: (summary: ReviewedSummary) => Promise<void>;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [answers, setAnswers] = useState<Clarification[]>([]);
  const [answer, setAnswer] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const pending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!suggestion && !busy) return;
    const before = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("a,button") &&
        !panel.current?.contains(target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setError("Save or discard this suggestion before moving on. Your original note is safe.");
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", navigate, true);
    };
  }, [suggestion, busy]);
  const ask = async (followup = false) => {
    if (pending.current) return;
    if (followup && !answer.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const current = await onPrepare(note.id);
      if (followup && suggestion && suggestion.version !== current.version)
        throw new Error("Your note changed. Start a new polish so it uses your latest wording.");
      const nextAnswers =
        followup && suggestion
          ? [...answers, { question: suggestion.question, answer: answer.trim() }]
          : [];
      controller.current?.abort();
      controller.current = new AbortController();
      const response = await fetch("/api/personal/polish", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal: controller.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: current.id,
          version: current.version,
          answers: nextAnswers,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.suggestion)
        throw new Error(body.error || "No suggestion was returned. Your original is unchanged.");
      const next = body.suggestion as Suggestion;
      setSuggestion(next);
      setAnswers(nextAnswers);
      setAnswer("");
      setText(next.summary);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Polishing failed. Your original is safe.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const save = async () => {
    if (!suggestion || !text.trim() || pending.current) return;
    pending.current = true;
    setSaving(true);
    setBusy(true);
    setError("");
    try {
      await onSave({ id: note.id, version: suggestion.version, text: text.trim(), answers });
      setSuggestion(null);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your suggested wording is still here.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setSaving(false);
    }
  };
  const editSaved = () => {
    setSuggestion({
      status: "ready",
      question: "",
      summary: note.polishedSummary,
      noteId: note.id,
      version: note.version,
      original: note.polishedOriginal,
    });
    setText(note.polishedSummary);
    setAnswers(note.polishedAnswers ?? []);
    setError("");
    setSaved(false);
  };
  return (
    <section ref={panel} className="pw-polish" aria-label="Work summary">
      <header>
        <div>
          <Sparkles size={17} aria-hidden="true" />
          <h3>Work summary</h3>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="pw-btn pw-btn-sm"
            disabled={busy || !!suggestion}
            onClick={() => void ask()}
          >
            {busy ? "Working…" : "Polish into work summary"}
          </button>
        )}
      </header>
      {!note.polishedSummary && !suggestion && !busy && (
        <p className="pw-hint">
          Turn your quick note into clear wording. Your original stays unchanged.
        </p>
      )}
      {busy && (
        <p role="status" className="pw-hint">
          {saving
            ? "Saving your reviewed wording…"
            : "Checking the wording against your note and confirmed details…"}
        </p>
      )}
      {error && (
        <p role="alert" className="pw-polish-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="pw-polish-saved">
          <Check size={15} aria-hidden="true" />
          Work summary saved. Original note kept.
        </p>
      )}
      {suggestion?.status === "clarify" && (
        <div className="pw-polish-question">
          <label htmlFor={`polish-answer-${note.id}`}>
            <MessageCircle size={17} aria-hidden="true" />
            {suggestion.question}
          </label>
          <textarea
            id={`polish-answer-${note.id}`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={3000}
            rows={2}
            disabled={busy}
            placeholder="A short answer is enough. If you don’t know, say so."
          />
          <button
            type="button"
            className="pw-btn pw-btn-sm pw-btn-primary"
            disabled={busy || !answer.trim() || answers.length >= 8}
            onClick={() => void ask(true)}
          >
            Use my answer
          </button>
          <button
            type="button"
            className="pw-btn pw-btn-sm"
            disabled={busy}
            onClick={() => setDiscarding(true)}
          >
            Start over
          </button>
          {answers.length >= 8 && (
            <p className="pw-hint">
              Start a new polish with the confirmed details added to your note.
            </p>
          )}
        </div>
      )}
      {suggestion?.status === "ready" && (
        <div className="pw-polish-review">
          <div className="pw-polish-columns">
            <div>
              <h4>Original note</h4>
              <p className="pw-polish-original">{suggestion.original}</p>
            </div>
            <div>
              <label htmlFor={`polish-text-${note.id}`}>Suggested wording · editable</label>
              <textarea
                id={`polish-text-${note.id}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={12000}
                rows={5}
                disabled={busy}
              />
            </div>
          </div>
          <p className="pw-hint">
            Save after checking the facts. This updates the note’s linked task wording, not its
            completion status.
          </p>
          <div className="pw-polish-actions">
            <button
              type="button"
              className="pw-btn pw-btn-sm"
              disabled={busy}
              onClick={() => setDiscarding(true)}
            >
              Discard suggestion
            </button>
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-primary"
              disabled={busy || !text.trim()}
              onClick={() => void save()}
            >
              Save work summary
            </button>
          </div>
        </div>
      )}
      {discarding && (
        <div
          className="pw-polish-question"
          role="group"
          aria-label="Discard suggestion confirmation"
        >
          <p>Discard this unsaved suggestion? Your original note stays unchanged.</p>
          <button type="button" className="pw-btn pw-btn-sm" onClick={() => setDiscarding(false)}>
            Keep editing
          </button>
          <button
            type="button"
            className="pw-btn pw-btn-sm"
            onClick={() => {
              setSuggestion(null);
              setDiscarding(false);
              setAnswers([]);
              setAnswer("");
              setError("");
            }}
          >
            Discard
          </button>
        </div>
      )}
      {note.polishedSummary && !suggestion && (
        <div className="pw-polish-saved-copy">
          <div className="pw-polish-columns">
            <div>
              <h4>Original note · kept for reference</h4>
              <p className="pw-polish-original">{note.polishedOriginal}</p>
            </div>
            <div>
              <h4>Saved work summary</h4>
              <p className="pw-polish-copy">{note.polishedSummary}</p>
              {!readOnly && note.polishedCurrent && (
                <button
                  type="button"
                  className="pw-btn pw-btn-sm"
                  disabled={busy}
                  onClick={editSaved}
                >
                  Edit wording
                </button>
              )}
            </div>
          </div>
          {!note.polishedCurrent && (
            <p className="pw-hint">
              The note has changed since this wording was saved. Polish again to include those
              edits.
            </p>
          )}
          {!!note.polishedAnswers?.length && (
            <details>
              <summary>Confirmed details</summary>
              {note.polishedAnswers.map((a, i) => (
                <div key={i}>
                  <strong>{a.question}</strong>
                  <p>{a.answer}</p>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
