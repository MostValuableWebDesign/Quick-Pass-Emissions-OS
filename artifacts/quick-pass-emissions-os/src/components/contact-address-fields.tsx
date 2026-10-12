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
  const [selected, setSelected] = useState(value.addressSource === "GEOAPIFY_SELECTED");
  const [proof, setProof] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState(
    "Search for a US street address, or enter the fields below manually.",
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
    // Unit details belong to the user, not the geocoder's locality display line.
    const unit = query
      .match(/(?:\b(?:apt\.?|apartment|suite|ste\.?|unit)\s+|#\s*)[^,]+/i)?.[0]
      ?.trim();
    setAddress((previous) => ({
      ...previous,
      ...item.address,
      addressLine2: previous.addressLine2 || unit || "",
    }));
    setSelected(true);
    setProof(item.proof);
    cancel();
    setQuery("");
    setMessage("Street selected. Review the address and apartment or suite before saving.");
  }
  return (
    <fieldset className="contact-address-fields wide">
      <legend>{label}</legend>
      <div className="address-search">
        <label htmlFor={`${id}-search`}>Find an address</label>
        <input
          id={`${id}-search`}
          role="combobox"
          autoComplete="off"
          maxLength={200}
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-help`}
          value={query}
          onChange={(event) => {
            cancel();
            const next = event.target.value;
            setQuery(next);
            setMessage(
              next.trim().length >= 3
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
          Search text is sent to{" "}
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
      <p className="address-source" aria-live="polite">
        {selected
          ? "Provider selected · Geoapify street address. Apartment/suite entered manually. Delivery not validated."
          : "Manually entered · Address not validated."}
      </p>
      <input type="hidden" name="addressProof" value={proof} />
      <div className="form-grid">
        {addressKeys.map((key) => {
          const labels = {
            streetAddress: "Street address",
            addressLine2: "Apartment, suite or unit (optional)",
            city: "City",
            state: "State",
            postalCode: "ZIP / postal code",
          };
          const autocomplete = {
            streetAddress: "address-line1",
            addressLine2: "address-line2",
            city: "address-level2",
            state: "address-level1",
            postalCode: "postal-code",
          };
          const props = {
            name: key,
            autoComplete: autocomplete[key],
            value: address[key],
            maxLength:
              key === "streetAddress"
                ? 1000
                : key === "addressLine2"
                  ? 160
                  : key === "postalCode"
                    ? 20
                    : 100,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              setAddress((previous) => ({ ...previous, [key]: event.target.value }));
              if (key !== "addressLine2") {
                cancel();
                setProof("");
                setSelected(false);
              }
            },
          };
          return (
            <Field
              key={key}
              label={labels[key]}
              wide={key === "streetAddress" || key === "addressLine2"}
            >
              {key === "streetAddress" ? (
                <textarea {...props} rows={2} required={requiredStreet} />
              ) : (
                <input {...props} />
              )}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
