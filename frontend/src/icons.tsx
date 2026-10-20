import type { ReactNode } from "react";

function Icon({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Icon>
);

export const BasketIcon = () => (
  <Icon>
    <path d="M5 8h14l-1.5 11h-11z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
);

export const UsIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M15 15a5 5 0 0 1 6 5" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon size={18}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon size={20}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
