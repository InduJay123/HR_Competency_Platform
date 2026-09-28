type Draft = { dirty: () => boolean; discard: () => void };
const drafts = new Set<Draft>();
export function registerDraft(draft: Draft) {
  drafts.add(draft);
  return () => {
    drafts.delete(draft);
  };
}
export function confirmLeaveDraft(): boolean {
  const unsaved = [...drafts].filter((draft) => draft.dirty());
  if (!unsaved.length) return true;
  if (
    !window.confirm(
      "Some review changes are not saved. Stay on this page to save them, or leave and discard the unsaved changes.",
    )
  )
    return false;
  unsaved.forEach((draft) => draft.discard());
  return true;
}
