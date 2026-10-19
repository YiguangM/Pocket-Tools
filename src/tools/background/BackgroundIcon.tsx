import type { IconProps } from "../../shared/ui/icons";

export function BackgroundIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <circle cx="12" cy="9.5" r="3" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
    </svg>
  );
}
