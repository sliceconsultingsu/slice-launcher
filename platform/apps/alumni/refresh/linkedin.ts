// The one piece of LinkedIn-specific code in the repository. It only builds a text address from a
// stored contact value. Nothing in the repository fetches that address or reads the page: a Slice
// admin's own assistant does that from their own browser and files what it read.

const PROFILE = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-z0-9\-_%]{3,100})(?:[/?#].*)?$/i;

/**
 * The address of a person's experience page, or null when the stored value is not a profile
 * address. Accepts the profile address with or without https://, www., a trailing slash, a query
 * string or extra path parts.
 */
export function experienceUrl(linkedinValue: string): string | null {
  const slug = PROFILE.exec(linkedinValue.trim())?.[1];
  return slug ? `https://www.linkedin.com/in/${slug}/details/experience/` : null;
}
