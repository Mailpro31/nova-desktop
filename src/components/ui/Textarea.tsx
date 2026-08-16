import React from "react";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "compact";
}

export const Textarea: React.FC<TextareaProps> = ({
  className = "",
  variant = "default",
  ...props
}) => {
  const baseClasses =
    "w-full resize-y border border-hairline bg-inset text-start text-sm font-normal leading-relaxed text-text [border-radius:var(--nova-radius-control)] transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-text-secondary/75 hover:border-text-secondary/35 hover:bg-surface focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-65";

  const variantClasses = {
    default: "px-3 py-2 min-h-[100px]",
    compact: "px-2 py-1 min-h-[80px]",
  };

  return (
    <textarea
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
};
