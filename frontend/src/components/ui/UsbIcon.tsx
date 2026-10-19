export function UsbIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M12 5v14' />
      <path d='M12 16.5 6.5 13v-2.5' />
      <path d='M12 14.5 17.5 11V8.5' />
      <polygon points='12,2 8.8,6 15.2,6' fill='currentColor' stroke='none' />
      <circle cx='12' cy='20' r='2.2' fill='currentColor' stroke='none' />
      <circle cx='6.5' cy='10' r='2' fill='currentColor' stroke='none' />
      <rect x='15.6' y='6.6' width='3.8' height='3.8' rx='0.6' fill='currentColor' stroke='none' />
    </svg>
  )
}
