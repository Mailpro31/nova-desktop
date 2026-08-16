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
  // Même grammaire que Input : creux, filet de contour, rayon 10 px, focus
  // visible. Seule la hauteur minimale change entre les variantes.
  const baseClasses =
    "text-sm text-text leading-relaxed bg-inset border border-hairline-strong rounded-control text-start resize-y " +
    "placeholder:text-text-secondary/75 transition-colors duration-[120ms] hover:border-accent/60 " +
    "focus:outline-2 focus:outline-offset-2 focus:outline-accent focus:border-accent " +
    "disabled:opacity-40 disabled:cursor-not-allowed";

  const variantClasses = {
    default: "px-3 py-2 min-h-[100px]",
    compact: "px-2.5 py-1.5 min-h-[80px]",
  };

  return (
    <textarea
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
};
