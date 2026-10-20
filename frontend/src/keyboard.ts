// Keeps the app exactly as tall as the part of the screen you can see, so the
// on-screen keyboard shrinks the list instead of pushing the whole app up and
// out of view. Android does this through the viewport meta tag
// (interactive-widget=resizes-content); iOS doesn't support that, so this
// follows the visual viewport and sizes the app with --app-height.
//
// While you type in a field on a touch screen, <html> also gets data-typing,
// which hides the tab bar so the list keeps a usable amount of room.

const isField = (el: EventTarget | null) =>
  el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(el.type);

export function fitAppToKeyboard() {
  const html = document.documentElement;
  const vv = window.visualViewport;

  if (vv) {
    const fit = () => {
      html.style.setProperty("--app-height", `${vv.height}px`);
      // iOS scrolls the page to show the focused field. The app already fits
      // above the keyboard, so undo that scroll instead of losing the header.
      if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    fit();
  }

  const touch = matchMedia("(pointer: coarse)");
  document.addEventListener("focusin", (e) => {
    if (touch.matches && isField(e.target)) html.dataset.typing = "";
  });
  document.addEventListener("focusout", (e) => {
    if (isField(e.target)) delete html.dataset.typing;
  });
}
