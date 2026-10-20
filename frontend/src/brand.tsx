import s from "./brand.module.css";

export const Wordmark = () => (
  <span className={s.wordmark}>
    miffer<span className={s.dot}>.</span>
  </span>
);

export const Avatars = () => (
  <div className={s.avatars}>
    <span className={`${s.avatar} ${s.you}`} title="You" aria-label="You">
      Y
    </span>
    <span className={`${s.avatar} ${s.partner}`} title="Partner" aria-label="Partner">
      P
    </span>
  </div>
);
