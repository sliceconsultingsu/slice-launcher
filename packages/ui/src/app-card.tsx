import { AppIcon } from "./app-icon";

export interface AppCardProps {
  name: string;
  description: string;
  icon: string;
  /** The app's platform route, or null while it is not yet available. */
  href: string | null;
  guideHref: string;
}

const pill =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--accent)";

/** One app in the launcher grid: icon, name, description, then Open and Guide actions. */
export function AppCard({ name, description, icon, href, guideHref }: AppCardProps) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-(--line) bg-(--surface) p-6 text-(--ink)">
      <AppIcon src={icon} size={40} />
      <h2 className="mt-5 text-lg leading-snug font-bold tracking-tight">{name}</h2>
      <p className="mt-2 mb-6 line-clamp-3 text-[15px] leading-6 text-(--muted)">{description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        {href ? (
          <a className={`${pill} bg-(--accent) text-white hover:bg-(--accent-hover)`} href={href}>
            Open<span className="sr-only"> {name}</span>
          </a>
        ) : (
          <span className="inline-flex rounded-full border border-(--line) bg-(--selected) px-3 py-1 text-[13px] font-semibold text-(--muted)">
            Coming soon
          </span>
        )}
        <a
          className={`${pill} border-[1.5px] border-(--ink) bg-(--surface) text-(--ink) hover:bg-(--selected)`}
          href={guideHref}
        >
          Guide<span className="sr-only"> for {name}</span>
        </a>
      </div>
    </article>
  );
}
