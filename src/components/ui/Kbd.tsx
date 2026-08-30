import React from "react";

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({
  children,
  className = "",
  ...props
}) => (
  <kbd
    className={`inline-flex min-h-6 items-center justify-center rounded-md border border-hairline bg-inset px-1.5 text-[0.75rem] font-medium leading-none text-text-secondary shadow-[var(--nova-shadow-sm)] ${className}`}
    {...props}
  >
    {children}
  </kbd>
);
