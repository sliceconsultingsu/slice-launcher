export type AppIconSize = 20 | 32 | 40 | 48;

export interface AppIconProps {
  /** Platform-published icon path from the generated catalog, e.g. /app-icons/alumni.svg?v=… */
  src: string;
  size?: AppIconSize;
}

/**
 * Shows an app's icon. Always an <img>, never inline SVG, so icon files cannot run code in the
 * page. Icons are decorative because the app's name is always shown beside them.
 */
export function AppIcon({ src, size = 40 }: AppIconProps) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="block shrink-0 rounded-[23%] object-cover"
      style={{ width: size, height: size }}
    />
  );
}
