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
        <div className="px-4">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-text-secondary mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="bg-surface border border-hairline rounded-card overflow-visible">
        <div className="divide-y divide-hairline">{children}</div>
      </div>
    </section>
  );
};
