// Keeps the app exactly as tall as the part of the screen you can see, so the
// on-screen keyboard shrinks the list instead of pushing the whole app up and
// out of view. It follows the visual viewport and sizes the app with
// --app-height, on Android too: there the page itself could resize instead
// (interactive-widget=resizes-content), but a page resize cancels any running
// View Transition, so a list animation would be lost whenever the keyboard's
// height changes, like when Chrome's autofill bar above it closes.
//
// While the keyboard is open on a touch screen, <html> also gets data-keyboard,
// which hides the tab bar so the list keeps a usable amount of room. It's based
// on the keyboard being open, not on a field having focus: on Android you can
// close the keyboard and the field stays focused.

// Shorter than this compared to the keyboard-less height means the keyboard is open.
// More than Safari's address bar sliding in and out, less than any keyboard.
const KEYBOARD_MIN = 150;

export function fitAppToKeyboard() {
  const html = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) return;

  const touch = matchMedia("(pointer: coarse)");
  let fullHeight = 0;
  let width = 0;
  let height = 0;

  const fit = () => {
    // Rotating the phone gives a new keyboard-less height to measure against.
    if (vv.width !== width) {
      width = vv.width;
      fullHeight = 0;
    }
    fullHeight = Math.max(fullHeight, vv.height);
    html.style.setProperty("--app-height", `${vv.height}px`);
    html.toggleAttribute("data-keyboard", touch.matches && vv.height < fullHeight - KEYBOARD_MIN);
    // When the keyboard opens, the field you're typing in can end up below the
    // fold of whatever it scrolls in, like a field low in a tall sheet: scroll it back.
    const field = document.activeElement;
    if (vv.height < height && field?.matches("input, textarea")) field.scrollIntoView({ block: "nearest" });
    height = vv.height;
    // iOS scrolls the page to show the focused field. The app already fits
    // above the keyboard, so undo that scroll instead of losing the header.
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  };

  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  fit();
}
