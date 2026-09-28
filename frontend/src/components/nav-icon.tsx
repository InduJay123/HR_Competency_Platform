import type { ReactNode } from "react";
const icons: Record<string, ReactNode> = {
  home: (
    <>
      <path className="icon-wash" d="M3 10L12 3L21 10V21H3Z" />
      <path d="M3 10L12 3L21 10M5 9V20H19V9M9 20V13H15V20" />
    </>
  ),
  people: (
    <>
      <circle className="icon-wash" cx="9" cy="8" r="4" />
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20V18C3 12 15 12 15 18V20M16 5C20 5 20 11 16 11M18 14C21 14 22 16 22 19" />
    </>
  ),
  requests: (
    <>
      <circle className="icon-wash" cx="9" cy="8" r="4" />
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20V18C3 13 14 12 15 17M19 11V19M15 15H23" />
    </>
  ),
  organisation: (
    <>
      <path className="icon-wash" d="M4 21V5L14 3V21Z" />
      <path d="M4 21V5L14 3V21M14 9H20V21M2 21H22M8 8H10M8 12H10M8 16H10M17 13H18M17 17H18" />
    </>
  ),
  hierarchy: (
    <>
      <rect className="icon-wash" x="8" y="2" width="8" height="6" rx="2" />
      <rect x="8" y="2" width="8" height="6" rx="2" />
      <path d="M12 8V12M5 16V12H19V16" />
      <rect x="2" y="16" width="6" height="5" rx="1.5" />
      <rect x="16" y="16" width="6" height="5" rx="1.5" />
    </>
  ),
  settings: (
    <>
      <circle className="icon-wash" cx="12" cy="12" r="8" />
      <path d="M9 3H15L16 6L19 7L21 11L19 14L19 18L15 21L12 19L8 21L4 18L5 14L3 11L5 7L8 6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  review: (
    <>
      <rect className="icon-wash" x="5" y="3" width="14" height="18" rx="3" />
      <path d="M15 20H6Q4 20 4 18V5Q4 3 6 3H16Q18 3 18 5V10M8 7H14M8 11H12M13 16L16 19L22 12" />
    </>
  ),
  cycles: (
    <>
      <rect className="icon-wash" x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3V7M16 3V7M3 10H21M7 21H5Q3 21 3 19V7Q3 5 5 5H19Q21 5 21 7V11M20 15A5 5 0 1 0 20 20M20 12V16H16" />
    </>
  ),
  growth: (
    <>
      <path
        className="icon-wash"
        d="M12 12C11 5 16 2 22 3C22 10 17 13 12 12M12 17C5 18 2 14 2 9C9 9 12 11 12 17"
      />
      <path d="M12 22V12M12 12C11 5 16 2 22 3C22 10 17 13 12 12ZM12 17C5 18 2 14 2 9C9 9 12 11 12 17ZM12 12L18 7" />
    </>
  ),
  history: (
    <>
      <circle className="icon-wash" cx="13" cy="12" r="8" />
      <path d="M4 7A9 9 0 1 1 3 15M3 3V8H8M13 7V12L16 14" />
    </>
  ),
  work: (
    <>
      <rect className="icon-wash" x="3" y="7" width="18" height="14" rx="3" />
      <rect x="3" y="7" width="18" height="14" rx="3" />
      <path d="M8 7V4H16V7M3 12Q12 17 21 12M10 14V16H14V14" />
    </>
  ),
  flag: (
    <>
      <path className="icon-wash" d="M5 3H21L17 8L21 13H5Z" />
      <path d="M5 22V3H21L17 8L21 13H5" />
    </>
  ),
  approval: (
    <>
      <path className="icon-wash" d="M12 2L21 6V12Q21 19 12 22Q3 19 3 12V6Z" />
      <path d="M12 2L21 6V12Q21 19 12 22Q3 19 3 12V6ZM8 12L11 15L17 9" />
    </>
  ),
  guide: (
    <>
      <path className="icon-wash" d="M12 5Q7 2 2 4V20Q7 18 12 21Z" />
      <path d="M12 5Q7 2 2 4V20Q7 18 12 21Q17 18 22 20V4Q17 2 12 5V21M5 8H8M16 8H19" />
    </>
  ),
  intro: (
    <>
      <rect className="icon-wash" x="3" y="4" width="18" height="16" rx="4" />
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M10 8L16 12L10 16Z" />
    </>
  ),
  account: (
    <>
      <circle className="icon-wash" cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="9" r="3" />
      <path d="M5 19Q6 14 12 14Q18 14 19 19" />
    </>
  ),
  bell: (
    <>
      <path className="icon-wash" d="M5 17L6 8Q6 3 12 3Q18 3 18 8L19 17Z" />
      <path d="M3 18L5 15V9Q5 3 12 3Q19 3 19 9V15L21 18ZM9 21H15M12 1V3" />
    </>
  ),
};
export function NavIcon({ name }: { name: string }) {
  return (
    <span className={`nav-icon nav-icon-${name}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {icons[name] || icons.work}
      </svg>
    </span>
  );
}
export function routeIcon(url: string) {
  if (url.includes("review-history")) return "history";
  if (url.includes("review-cycles")) return "cycles";
  if (url.includes("join-requests")) return "requests";
  if (url.includes("management-structure")) return "hierarchy";
  if (url.includes("organisation")) return "organisation";
  if (url.includes("settings")) return "settings";
  if (url.includes("employees") || url.includes("/team")) return "people";
  if (url.includes("dashboard")) return "home";
  if (url.includes("tasks")) return "work";
  if (url.includes("reviews") || url.includes("cycles")) return "review";
  if (url.includes("development") || url.includes("growth")) return "growth";
  return "work";
}
