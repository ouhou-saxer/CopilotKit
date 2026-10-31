import { useState } from "react";

const SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-base",
  lg: "w-16 h-16 text-xl",
} as const;

/** First letters of up to two name parts, e.g. "Yves" -> "Y". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Show the user's image when one is set, otherwise local initials.
 * Initials need no external avatar service, so no names leave the browser.
 */
export function Avatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image?: string;
  size?: keyof typeof SIZES;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;

  return (
    <div className="relative flex-shrink-0">
      {showImage ? (
        <img
          src={image}
          alt={name}
          onError={() => setFailed(true)}
          className={`${SIZES[size]} rounded-full object-cover border-2 border-white/20`}
        />
      ) : (
        <div
          role="img"
          aria-label={name}
          className={`${SIZES[size]} rounded-full border-2 border-white/20 bg-white/25 text-white font-semibold flex items-center justify-center`}
        >
          {initials(name)}
        </div>
      )}
      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
    </div>
  );
}
