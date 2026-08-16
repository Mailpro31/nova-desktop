import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "secondary";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
}) => {
  // Tokens sémantiques uniquement : un badge qualifie, il ne décore pas.
  // Teinte à 12 % + texte à pleine saturation — l'ancien texte sombre sur
  // aplat d'accent n'avait pas un contraste suffisant.
  const variantClasses = {
    primary: "bg-accent/12 text-accent",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/10 text-danger",
    secondary: "bg-mid-gray/15 text-text-secondary",
  };

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-chip px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
