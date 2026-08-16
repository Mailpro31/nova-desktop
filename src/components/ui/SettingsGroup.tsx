import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <section className="space-y-3">
      {title && (
        <div className="px-1">
          <h2 className="text-base font-semibold leading-tight text-text">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="overflow-visible border border-hairline bg-surface [border-radius:var(--nova-radius-card)]">
        <div className="divide-y divide-hairline">{children}</div>
      </div>
    </section>
  );
};
