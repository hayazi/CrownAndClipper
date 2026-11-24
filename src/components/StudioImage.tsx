import { Scissors } from 'lucide-react';
import { useState } from 'react';

interface StudioImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
}

export function StudioImage({ src, alt, className = '', fallbackTitle }: StudioImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-stone-200 via-stone-100 to-stone-200 text-stone-600 p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Scissors className="w-7 h-7 mb-2 text-stone-500" aria-hidden="true" />
        <span className="text-xs font-medium tracking-wide text-stone-700">
          {fallbackTitle}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
