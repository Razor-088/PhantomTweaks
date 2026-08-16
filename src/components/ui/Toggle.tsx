interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-gaccent/80' : 'bg-gbase3 border border-gborder2'
      }`}
      style={{ height: 22, width: 40 }}
    >
      <span
        className={`inline-block rounded-full transition-transform duration-200 ${
          checked ? 'bg-gbase' : 'bg-gmuted'
        }`}
        style={{ height: 16, width: 16, marginLeft: 3, transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
      />
      {label && <span className="ml-3 text-sm text-gmuted">{label}</span>}
    </button>
  );
}
