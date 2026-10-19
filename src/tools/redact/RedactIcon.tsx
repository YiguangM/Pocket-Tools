import type { IconProps } from "../../shared/ui/icons";

export function RedactIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M16 4h3a1 1 0 0 1 1 1v3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="8" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="13" y="8" width="3" height="3" />
      <rect x="8" y="13" width="3" height="3" />
      <rect x="13" y="13" width="3" height="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
