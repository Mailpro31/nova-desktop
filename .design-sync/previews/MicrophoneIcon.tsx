import React from "react";
import { MicrophoneIcon } from "nova-app";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

export const Sizes = () => (
  <div style={row}>
    <MicrophoneIcon width={16} height={16} />
    <MicrophoneIcon width={24} height={24} />
    <MicrophoneIcon width={40} height={40} />
    <MicrophoneIcon width={64} height={64} />
  </div>
);

export const Colors = () => (
  <div style={row}>
    <MicrophoneIcon width={32} height={32} />
    <MicrophoneIcon width={32} height={32} color="var(--color-accent)" />
    <MicrophoneIcon width={32} height={32} color="var(--color-danger)" />
    <MicrophoneIcon
      width={32}
      height={32}
      color="var(--color-text-secondary)"
    />
  </div>
);

export const InlineWithLabel = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
    <MicrophoneIcon width={18} height={18} />
    <span>Micro du MacBook Pro</span>
  </div>
);
