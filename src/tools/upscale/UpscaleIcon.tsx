import type { IconProps } from "../../shared/ui/icons";

export function UpscaleIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <path d="M14 3h7v7" />
      <path d="m21 3-8 8" />
      <path d="M3 9V5a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
