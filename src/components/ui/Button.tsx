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
  const baseClasses =
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border font-medium [border-radius:var(--nova-radius-control)] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none";

  const variantClasses = {
    primary:
      "border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover",
    "primary-soft":
      "border-transparent bg-accent/12 text-accent hover:bg-accent/18",
    secondary: "border-transparent bg-inset text-text hover:bg-mid-gray/20",
    danger:
      "border-danger bg-danger text-white hover:brightness-90 focus-visible:ring-danger",
    "danger-ghost":
      "border-transparent text-danger hover:bg-danger/10 focus-visible:ring-danger",
    ghost:
      "border-transparent bg-transparent text-current hover:bg-mid-gray/10",
  };

  const sizeClasses = {
    sm: "min-h-8 px-3 py-1 text-xs",
    md: "min-h-10 px-4 py-2 text-sm",
    lg: "min-h-10 px-[18px] py-2 text-sm font-semibold",
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
