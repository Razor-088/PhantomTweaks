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
      className={`relative inline-flex items-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none disabled:opacity-40 ${
        checked
          ? 'bg-gaccent/80 shadow-[0_0_16px_rgba(0,255,136,0.25),0_0_4px_rgba(0,255,136,0.4)]'
          : 'bg-gbase3 border border-gborder2/60 hover:border-gborder2'
      }`}
      style={{ height: 24, width: 44 }}
    >
      <span
        className={`inline-block rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] shadow-sm ${
          checked
            ? 'bg-gbase shadow-[0_0_8px_rgba(0,255,136,0.4)]'
            : 'bg-gdim'
        }`}
        style={{
          height: 18,
          width: 18,
          marginLeft: 3,
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
      {label && <span className="ml-3 text-sm text-gmuted">{label}</span>}
    </button>
  );
}
