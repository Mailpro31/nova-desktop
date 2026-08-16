import React from "react";
import { Dropdown } from "nova-app";

const noop = () => {};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 320,
};

const devices = [
  { value: "default", label: "Périphérique par défaut" },
  { value: "macbook", label: "Micro du MacBook Pro" },
  { value: "airpods", label: "AirPods Pro" },
  { value: "usb", label: "Yeti USB", disabled: true },
];

export const Selected = () => (
  <div style={stack}>
    <Dropdown options={devices} selectedValue="macbook" onSelect={noop} />
  </div>
);

export const Placeholder = () => (
  <div style={stack}>
    <Dropdown
      options={devices}
      selectedValue={null}
      onSelect={noop}
      placeholder="Choisir un microphone…"
    />
  </div>
);

// `onRefresh` n'a pas de rendu propre : le rappel est déclenché à l'ouverture
// de la liste pour rafraîchir les options. Rien à montrer statiquement — on
// illustre à la place la troncature d'un libellé long, qui, elle, se voit.
export const LongLabel = () => (
  <div style={stack}>
    <Dropdown
      options={[
        {
          value: "usb",
          label: "Blue Yeti Nano — entrée microphone USB (avant)",
        },
      ]}
      selectedValue="usb"
      onSelect={noop}
      onRefresh={noop}
    />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Dropdown
      options={devices}
      selectedValue="default"
      onSelect={noop}
      disabled
    />
  </div>
);
