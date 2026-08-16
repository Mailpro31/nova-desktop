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
  // Planche de fondation : creux + filet de contour, rayon 10 px, hauteur de
  // contrôle fixe. Le texte d'un champ est du corps, pas du gras.
  const baseClasses =
    "text-sm text-text bg-inset border border-hairline-strong rounded-control text-start " +
    "placeholder:text-text-secondary/75 transition-colors duration-[120ms]";

  const interactiveClasses = disabled
    ? "opacity-40 cursor-not-allowed"
    : "hover:border-accent/60 focus:outline-2 focus:outline-offset-2 focus:outline-accent focus:border-accent";

  const variantClasses = {
    default: "h-[var(--control-h)] px-3",
    compact: "h-[var(--control-h-sm)] px-2.5",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
