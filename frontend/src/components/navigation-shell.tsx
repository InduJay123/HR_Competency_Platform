"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { NavIcon } from "./nav-icon";

export function NavigationShell({ className, sidebarClassName, navigation, children }: {
  className: string;
  sidebarClassName: string;
  navigation: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const resize = () => { if (!media.matches) setOpen(false); };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const returnFocus = trigger.current;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    closeButton.current?.focus();
    return () => {
      Object.assign(body.style, previous);
      window.scrollTo(0, scrollY);
      if (window.matchMedia("(max-width: 768px)").matches) returnFocus?.focus();
    };
  }, [open]);

  return (
    <div className={`${className} navigation-shell`}>
      <div className="mobile-navigation-header" inert={open || undefined}>
        <button ref={trigger} type="button" className="navigation-icon-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <NavIcon name={open ? "close" : "menu"} />
        </button>
        <Brand compact />
      </div>
      {open && <button type="button" className="navigation-backdrop" tabIndex={-1}
        aria-label="Dismiss navigation" onClick={() => setOpen(false)} />}
      <aside ref={drawer} id={id}
        className={`${sidebarClassName} navigation-sidebar${open ? " navigation-open" : ""}`}
        role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-label="Navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("nav a, nav button, a[href]")) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          if (event.key !== "Tab") return;
          const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]):not([hidden]), [tabindex="0"]',
          ) || []).filter(element => !element.closest(".desktop-nav-brand") && !element.hidden);
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="mobile-drawer-top">
          <Brand compact />
          <button ref={closeButton} type="button" className="navigation-icon-button"
            aria-label="Close navigation" aria-controls={id} aria-expanded={open} onClick={() => setOpen(false)}>
            <NavIcon name="close" />
          </button>
        </div>
        {navigation}
      </aside>
      <div className="navigation-content" inert={open || undefined}>{children}</div>
    </div>
  );
}
