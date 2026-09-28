# Steward animation integration

Updated 27 September 2026.

The supplied ReasoningText component is integrated at `frontend/src/components/ui/reasoning-text.tsx`. The repository already supports TypeScript and the `@/` alias points to `src/`. Reusable UI components now have a `src/components/ui/` directory, matching the supplied imports while preserving existing components in `src/components/ui.tsx`.

## What changed

- The corner launcher contains only the animated SVG robot. It has no visible text, container background, border or card shadow. Its accessible name remains “Open corporate trainer”.
- Opening chat hides the launcher and removes the character from the chat header. Closing with the close button or Escape restores keyboard focus to the launcher.
- The supplied Motion-based cascade/swap/scramble component includes local helper implementations for easing, shimmer, loader and scramble. Its Tailwind utility classes were adapted to named CSS classes in `src/app/steward-refinement.css`, fitting the existing stylesheet architecture. A small CSS spinner replaces the unspecified ASCII loader dependency.
- `sending` mounts ReasoningText only during the actual training-message request. Conversation history loading uses a separate, accurate label. Completion or failure unmounts the animated indicator. Rotating phrases are general waiting messages, not claims about internal AI reasoning or access to employee records.
- Device reduced motion and the workspace pause control disable the JavaScript phrase rotation as well as CSS motion. Screen readers receive a stable status instead of repeated letter announcements.
- The hero now uses glass cards, moving connection highlights and gentle floating motion. Its artwork is decorative and is not a performance score.

## Dependencies and demo

`motion` is installed and pinned by `frontend/package-lock.json`. No image assets are needed for the thinking component. `src/components/ui/reasoning-text-demo.tsx` is a component-gallery example, not an always-running production loading state.

The original snippet's references to helper files were not supplied; these are implemented locally under `src/components/ui/reasoning-text-utils/`. The package uses [Motion AnimatePresence](https://motion.dev/docs/react-animate-presence) and [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion).

## Optional Tailwind/shadcn setup

This existing application uses plain CSS and is not initialized as a shadcn/Tailwind project. The adapted component works without a global styling migration. If future development calls for the original utility-class version:

1. In `frontend`, run `npm install tailwindcss @tailwindcss/postcss postcss`.
2. Add `@tailwindcss/postcss` to the plugins in `postcss.config.mjs`, and import Tailwind from the main CSS entry point. Review existing styles against Tailwind's base reset before adopting it across the application. See the [official Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
3. Run `npx shadcn@latest init`, select the existing Next.js project and retain the `@/components/ui` alias. Review generated theme tokens and CSS changes before merging. See [shadcn's Next.js installation](https://ui.shadcn.com/docs/installation/next).
4. TypeScript is already configured; no TypeScript migration is required.

## Live AI

Animation is operational without credentials. Live training replies still require the server's OpenAI configuration described in `TRAINER_SETUP.md`. Missing credentials continue to show explicitly labelled learning guides; the UI never simulates an AI reply.


## Interactive stewardship journey and navigation

The company dashboard hero now tells a four-step story: meaningful work, real evidence, human review and lasting growth. Each step changes the central illustration and explanation. Selecting a step pauses automatic progression; Play story resumes it. Playback suspends when the illustration is outside the viewport or the browser tab is hidden, and automatic progression is disabled for reduced-motion users. This illustrates the workflow rather than displaying inferred company performance.

Navigation uses distinct inline SVG icons for every main destination, including people, join requests, organisation, hierarchy, settings, reviews, cycles, growth, history, actions and approvals. A blue active icon and subtle hover motion distinguish the selected page. Existing navigation labels, permissions and destinations are preserved.

Implementation: `purpose-journey.tsx`, `nav-icon.tsx` and `purpose-journey.css`. The journey's automatic sequence, manual choice and reduced-motion behavior have automated coverage.
