/** The Falcon Times mark: a navy shield with a gold falcon in stoop. */
export function Logo({ size = 44, class: cls }: { size?: number; class?: string }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="The Falcon Times">
      <path d="M32 3 56 11v19c0 15.5-10.2 26.6-24 31C18.2 56.6 8 45.5 8 30V11z" fill="#002855" />
      <path d="M32 3 56 11v19c0 15.5-10.2 26.6-24 31C18.2 56.6 8 45.5 8 30V11z" fill="none" stroke="#F2B01E" stroke-width="2.5" />
      <path d="M14 21c8-1 14 1 19 6l12-8-5 11 8 1-10 5 4 9-11-6-7 6 1-9-11-3z" fill="#F2B01E" />
      <path d="M33 27l12-8-5 11-7-3z" fill="#FFD76A" />
      <circle cx="26" cy="27.5" r="1.7" fill="#002855" />
    </svg>
  );
}
