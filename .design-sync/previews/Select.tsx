import React from "react";
import { Select } from "nova-app";

const noop = () => {};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 320,
};

const languages = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "de", label: "Allemand" },
  { value: "ja", label: "Japonais" },
  { value: "ko", label: "Coréen", isDisabled: true },
];

export const Selected = () => (
  <div style={stack}>
    <Select value="fr" options={languages} onChange={noop} />
  </div>
);

export const Placeholder = () => (
  <div style={stack}>
    <Select
      value={null}
      options={languages}
      onChange={noop}
      placeholder="Langue de transcription…"
      isClearable
    />
  </div>
);

export const Loading = () => (
  <div style={stack}>
    <Select
      value={null}
      options={[]}
      onChange={noop}
      isLoading
      placeholder="Recherche des périphériques…"
    />
  </div>
);

export const Creatable = () => (
  <div style={stack}>
    <Select
      isCreatable
      value="nova"
      options={[
        { value: "nova", label: "Nova" },
        { value: "parakeet", label: "Parakeet" },
      ]}
      onChange={noop}
      onCreateOption={noop}
      placeholder="Ajouter un mot au lexique…"
      formatCreateLabel={(input) => `Ajouter « ${input} »`}
    />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Select value="en" options={languages} onChange={noop} disabled />
  </div>
);
