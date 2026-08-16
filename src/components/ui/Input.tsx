import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input: React.FC<InputProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "w-full border border-hairline bg-inset text-start text-sm font-normal text-text [border-radius:var(--nova-radius-control)] transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-text-secondary/75 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20";

  const interactiveClasses = disabled
    ? "cursor-not-allowed border-hairline bg-mid-gray/10 text-text-secondary opacity-65"
    : "hover:border-text-secondary/35 hover:bg-surface";

  const variantClasses = {
    default: "min-h-10 px-3 py-2",
    compact: "min-h-9 px-2.5 py-1.5",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
