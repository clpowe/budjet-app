export function usePopoverClose() {
  const closePopoverById = (id: string) => {
    const el = document.getElementById(id);
    // optional chaining in case older browsers
    (el as any)?.hidePopover?.();
  };

  return { closePopoverById };
}
