"use client";
import type { ReactNode } from "react";
import { APP } from "./client";

/** Up to two initials: the first and last word of a name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Which of the six tile colours a person gets. The same key always gives the same colour. */
export function shadeOf(key: string): number {
  let sum = 0;
  for (const letter of key) sum = (sum * 31 + letter.charCodeAt(0)) % 997;
  return sum % 6;
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";
export const profileHref = (id: string) => `${APP}/alumni/${encodeURIComponent(id)}`;

/** The value as a secure web address, or null when it is not one. */
export function httpsAddress(value: string): string | null {
  const address = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(address).protocol === "https:" ? address : null;
  } catch {
    return null;
  }
}

/** A person's coloured tile. Decorative: their name is always written beside it. */
export function Tile({
  id,
  name,
  size = "sm",
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span aria-hidden="true" className={`al-tile al-tile-${size} al-c${shadeOf(id)}`}>
      {initialsOf(name)}
    </span>
  );
}

/** The large coloured block with a person's initials at the top of a card or profile. */
export function Face({ id, name, children }: { id: string; name: string; children?: ReactNode }) {
  return (
    <span className={`al-face al-c${shadeOf(id)}`}>
      <svg aria-hidden="true" viewBox="0 0 200 200">
        <path d="M200 0 L200 194 A194 194 0 0 1 6 0 Z" fill="#ffffff" />
      </svg>
      <span aria-hidden="true" className="al-initials">
        {initialsOf(name)}
      </span>
      {children}
    </span>
  );
}

/** A tile, a name that links to the profile, and one line under it. */
export function PersonRow({
  id,
  name,
  link = true,
  children,
}: {
  id: string;
  name: string;
  link?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="al-person-row">
      <Tile id={id} name={name} />
      <div>
        {link ? <a href={profileHref(id)}>{name}</a> : <strong>{name}</strong>}
        {children}
      </div>
    </div>
  );
}

export function PersonChip({ id, name }: { id: string; name: string }) {
  return (
    <a className="al-person-chip" href={profileHref(id)}>
      <Tile id={id} name={name} />
      {name}
    </a>
  );
}
