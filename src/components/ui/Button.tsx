import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  // Planche de fondation : rayon 10 px, hauteur de contrôle fixe, filet de
  // contour, focus visible au clavier uniquement, transition micro (120 ms).
  const baseClasses =
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium rounded-control border cursor-pointer " +
    "transition-colors duration-[120ms] motion-reduce:transition-none " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed";

  // Un seul accent d'action : le bleu Nova. Les autres variantes s'appuient sur
  // les surfaces et les filets, jamais sur une couleur propre.
  const variantClasses = {
    primary:
      "text-white bg-accent border-accent hover:bg-accent-hover hover:border-accent-hover",
    "primary-soft":
      "text-accent bg-accent/10 border-transparent hover:bg-accent/15",
    secondary:
      "text-text bg-surface border-hairline-strong hover:bg-accent/10 hover:border-accent",
    danger:
      "text-white bg-danger border-danger hover:bg-danger/85 focus-visible:outline-danger",
    "danger-ghost":
      "text-danger border-transparent hover:bg-danger/10 active:bg-danger/15 focus-visible:outline-danger",
    ghost:
      "text-current border-transparent hover:bg-mid-gray/10 active:bg-mid-gray/15",
  };

  const sizeClasses = {
    sm: "h-[var(--control-h-sm)] px-3 text-[13px]",
    md: "h-[var(--control-h)] px-3.5 text-sm",
    lg: "h-[var(--control-h-lg)] px-[18px] text-sm font-semibold",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
