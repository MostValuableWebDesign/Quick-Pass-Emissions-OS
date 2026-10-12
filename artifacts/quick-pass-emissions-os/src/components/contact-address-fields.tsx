"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Field } from "./action-form";
import { addressKeys, type AddressSuggestion, type ContactAddress } from "@/lib/contact-address";

export function ContactAddressFields({
  value = {},
  label = "Address",
  requiredStreet = false,
}: {
  value?: ContactAddress;
  label?: string;
  requiredStreet?: boolean;
}) {
  const id = useId();
  const [address, setAddress] = useState(
    () =>
      Object.fromEntries(addressKeys.map((key) => [key, value[key] ?? ""])) as Record<
        (typeof addressKeys)[number],
        string
      >,
  );
  const [proof, setProof] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState(
    "Start typing a street address for suggestions, or enter the address manually.",
  );
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    generation.current++;
    controller.current?.abort();
    setSuggestions([]);
    setActive(-1);
  };
  useEffect(() => {
    if (query.trim().length < 3) return;
    const request = new AbortController();
    controller.current = request;
    const current = generation.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
          signal: request.signal,
        });
        if (!response.ok || response.redirected) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.suggestions)) throw new Error();
        if (request.signal.aborted || current !== generation.current) return;
        setSuggestions(data.suggestions);
        setMessage(
          data.suggestions.length
            ? `${data.suggestions.length} suggestions. Use arrow keys and Enter to select.`
            : "No matching street addresses. Enter the fields manually.",
        );
      } catch {
        if (!request.signal.aborted && current === generation.current)
          setMessage("Address lookup unavailable. You can enter and save the address manually.");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [query]);
  function choose(item: AddressSuggestion) {
    setAddress((previous) => ({
      ...previous,
      ...item.address,
    }));
    setProof(item.proof);
    cancel();
    setQuery("");
    setMessage("Street selected. Review the address before saving.");
  }
  return (
    <fieldset className="contact-address-fields wide">
      <legend>{label}</legend>
      <div className="form-grid">
        <div className="field wide address-autocomplete">
          <label htmlFor={`${id}-street`}>Street address</label>
          <StreetControl
            id={`${id}-street`}
            name="streetAddress"
            required={requiredStreet}
            multiline={!!value.streetAddress?.includes("\n")}
            role="combobox"
            autoComplete="off"
            maxLength={1000}
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={suggestions.length ? `${id}-list` : undefined}
            aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
            aria-describedby={`${id}-help`}
            value={address.streetAddress}
            onChange={(event) => {
              cancel();
              const next = event.target.value;
              setAddress((previous) => ({ ...previous, streetAddress: next }));
              setProof("");
              setQuery(next.length <= 200 ? next : "");
              setMessage(
                next.trim().length >= 3 && next.length <= 200
                  ? "Looking up suggestions…"
                  : "Type at least 3 characters, or enter the address manually.",
              );
            }}
            onBlur={() => {
              cancel();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancel();
              }
              if (!suggestions.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive(
                  (previous) =>
                    (previous < 0
                      ? event.key === "ArrowDown"
                        ? 0
                        : suggestions.length - 1
                      : previous + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                    suggestions.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active >= 0) choose(suggestions[active]);
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul
              className="address-suggestions"
              id={`${id}-list`}
              role="listbox"
              aria-label="Address suggestions"
            >
              {suggestions.map((item, index) => (
                <li
                  key={item.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
          <p id={`${id}-help`} className="muted" aria-live="polite">
            {message}
          </p>
          <small className="muted">
            Street address suggestions by{" "}
            <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
              Geoapify
            </a>
            . ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
            .
          </small>
        </div>
        <input type="hidden" name="addressProof" value={proof} />
        <input type="hidden" name="addressLine2" value={address.addressLine2} />
        {addressKeys
          .filter((key) => key !== "streetAddress" && key !== "addressLine2")
          .map((key) => {
            const labels = {
              streetAddress: "Street address",
              city: "City",
              state: "State",
              postalCode: "ZIP / postal code",
            };
            const autocomplete = {
              streetAddress: "address-line1",
              city: "address-level2",
              state: "address-level1",
              postalCode: "postal-code",
            };
            const props = {
              name: key,
              autoComplete: autocomplete[key],
              value: address[key],
              maxLength: key === "postalCode" ? 20 : 100,
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setAddress((previous) => ({ ...previous, [key]: event.target.value }));
                cancel();
                setQuery("");
                setProof("");
              },
            };
            return (
              <Field key={key} label={labels[key]}>
                <input {...props} />
              </Field>
            );
          })}
      </div>
    </fieldset>
  );
}

// Preserve multiline legacy billing addresses without silently stripping their line breaks.
function StreetControl({
  multiline,
  ...props
}: {
  multiline: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> & {
    onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  }) {
  return multiline ? (
    <textarea {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} rows={2} />
  ) : (
    <input {...props} />
  );
}
