import React from "react";
import SelectComponent from "react-select";
import CreatableSelect from "react-select/creatable";
import type {
  ActionMeta,
  Props as ReactSelectProps,
  SingleValue,
  StylesConfig,
} from "react-select";

export type SelectOption = {
  value: string;
  label: string;
  isDisabled?: boolean;
};

type BaseProps = {
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  onChange: (value: string | null, action: ActionMeta<SelectOption>) => void;
  onBlur?: () => void;
  className?: string;
  formatCreateLabel?: (input: string) => string;
};

type CreatableProps = {
  isCreatable: true;
  onCreateOption: (value: string) => void;
};

type NonCreatableProps = {
  isCreatable?: false;
  onCreateOption?: never;
};

export type SelectProps = BaseProps & (CreatableProps | NonCreatableProps);

// react-select est stylé en JS : les tokens de la planche de fondation sont
// donc référencés directement en var() plutôt que par des classes utilitaires.
const baseBackground = "var(--color-inset)";
const selectedBackground =
  "color-mix(in srgb, var(--color-accent) 12%, transparent)";
const hoverBackground =
  "color-mix(in srgb, var(--color-accent) 10%, transparent)";
const neutralBorder = "var(--color-hairline-strong)";

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "var(--control-h)",
    borderRadius: "var(--radius-control)",
    borderColor: state.isFocused ? "var(--color-accent)" : neutralBorder,
    // Focus visible : liseré d'accent décalé, comme les autres contrôles.
    boxShadow: state.isFocused
      ? "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-accent)"
      : "none",
    backgroundColor: baseBackground,
    fontSize: "0.875rem",
    color: "var(--color-text)",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
    ":hover": {
      borderColor: "color-mix(in srgb, var(--color-accent) 60%, transparent)",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingInline: 10,
    paddingBlock: 4,
  }),
  input: (base) => ({
    ...base,
    color: "var(--color-text)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--color-text)",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused
      ? "var(--color-accent)"
      : "var(--color-text-secondary)",
    ":hover": {
      color: "var(--color-accent)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
    ":hover": {
      color: "var(--color-accent)",
    },
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 30,
    padding: 4,
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
    borderRadius: "var(--radius-card)",
    border: "1px solid var(--color-hairline)",
    boxShadow: "var(--shadow-floating)",
  }),
  option: (base, state) => ({
    ...base,
    borderRadius: "var(--radius-chip)",
    backgroundColor: state.isSelected
      ? selectedBackground
      : state.isFocused
        ? hoverBackground
        : "transparent",
    color: state.isSelected ? "var(--color-accent)" : "var(--color-text)",
    fontWeight: state.isSelected ? 500 : 400,
    cursor: state.isDisabled ? "not-allowed" : base.cursor,
    opacity: state.isDisabled ? 0.4 : 1,
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
  }),
};

export const Select: React.FC<SelectProps> = React.memo(
  ({
    value,
    options,
    placeholder,
    disabled,
    isLoading,
    isClearable = true,
    onChange,
    onBlur,
    className = "",
    isCreatable,
    formatCreateLabel,
    onCreateOption,
  }) => {
    const selectValue = React.useMemo(() => {
      if (!value) return null;
      const existing = options.find((option) => option.value === value);
      if (existing) return existing;
      return { value, label: value, isDisabled: false };
    }, [value, options]);

    const handleChange = (
      option: SingleValue<SelectOption>,
      action: ActionMeta<SelectOption>,
    ) => {
      onChange(option?.value ?? null, action);
    };

    const sharedProps: Partial<ReactSelectProps<SelectOption, false>> = {
      className,
      classNamePrefix: "app-select",
      value: selectValue,
      options,
      onChange: handleChange,
      placeholder,
      isDisabled: disabled,
      isLoading,
      onBlur,
      isClearable,
      styles: selectStyles,
    };

    if (isCreatable) {
      return (
        <CreatableSelect<SelectOption, false>
          {...sharedProps}
          onCreateOption={onCreateOption}
          formatCreateLabel={formatCreateLabel}
        />
      );
    }

    return <SelectComponent<SelectOption, false> {...sharedProps} />;
  },
);

Select.displayName = "Select";
