export type Crumb = { label: string; href: string | null };

const MATTER_PATH = /^\/matters\/([^/]+)(\/share)?\/?$/;

/** Breadcrumb trail for a pathname. Pure; the last crumb has href null (current page). */
export function crumbsFor(pathname: string): Crumb[] {
  const match = MATTER_PATH.exec(pathname);
  if (!match) return [{ label: "All matters", href: null }];
  const [, matterId, share] = match;
  const brief = `/matters/${matterId}`;
  if (!share) return [{ label: "All matters", href: "/" }, { label: "Brief", href: null }];
  return [
    { label: "All matters", href: "/" },
    { label: "Brief", href: brief },
    { label: "Share with a provider", href: null },
  ];
}
