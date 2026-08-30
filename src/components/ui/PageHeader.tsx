import React from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  eyebrow,
  actions,
  className = "",
}) => (
  <header
    className={`flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}
  >
    <div className="min-w-0 max-w-2xl">
      {eyebrow && (
        <p className="mb-2 text-xs font-medium tracking-wide text-text-secondary">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
        {title}
      </h1>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    )}
  </header>
);

interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  actions,
  id,
  className = "",
}) => (
  <div
    className={`flex min-w-0 items-start justify-between gap-4 ${className}`}
  >
    <div className="min-w-0">
      <h2 id={id} className="text-base font-semibold leading-tight text-text">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    )}
  </div>
);
