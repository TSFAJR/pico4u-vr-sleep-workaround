export function Glyph({
  name,
  className = '',
}: {
  name: 'moon' | 'sun' | 'play' | 'stop' | 'link' | 'logs' | 'check'
  className?: string
}) {
  const paths = {
    moon: 'M20.5 14A9 9 0 0 1 10 3a9 9 0 1 0 10.5 11Z',
    sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
    play: 'm7 4 14 8-14 8Z',
    stop: 'M5 5h14v14H5Z',
    link: 'm10 14 4-4m-6 5-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    logs: 'M5 2h10l4 4v16H5Zm9 0v5h5M8 11h8m-8 4h8m-8 4h5',
    check: 'm5 12 4 4 10-10',
  }
  return (
    <svg
      className={className}
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill={['moon', 'play', 'stop'].includes(name) ? 'currentColor' : 'none'}
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d={paths[name]} />
      {name === 'sun' && <circle cx='12' cy='12' r='4' fill='currentColor' />}
    </svg>
  )
}
