import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useLayoutEffect, useRef, type ElementType, type HTMLAttributes } from "react";
import "./Reveal.css";

gsap.registerPlugin(SplitText, ScrollTrigger);

type Split = "lines" | "words" | "chars";

const TIMING: Record<Split, { duration: number; stagger: number }> = {
  lines: { duration: 1, stagger: 0.06 },
  words: { duration: 1, stagger: 0.03 },
  chars: { duration: 0.6, stagger: 0.01 },
};
const SPLIT_TYPE: Record<Split, string> = { lines: "lines", words: "words, lines", chars: "chars, words, lines" };

let fontsReady: Promise<unknown> | null = null;
/* Fonts change line breaks, so split after they load, but never wait longer than 1.5 s. */
function waitForFonts() {
  fontsReady ??= Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
  return fontsReady;
}

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  split: Split;
  delay?: number;
  stagger?: number;
  /** Play when scrolled into view instead of on mount. */
  playOnScroll?: boolean;
  /** Plain text only: SplitText rewrites the element's children. */
  children: string;
};

/** Masked text reveal (lines, words or characters slide up). Shows the text unanimated when motion is reduced. */
export function Reveal({ as: Tag = "div", split, delay = 0, stagger, playOnScroll = false, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.visibility = "visible";
      return;
    }
    let ctx: gsap.Context | undefined;
    let gone = false;
    void waitForFonts().then(() => {
      if (gone) return;
      ctx = gsap.context(() => {
        gsap.set(el, { visibility: "visible" });
        SplitText.create(el, {
          type: SPLIT_TYPE[split],
          mask: split,
          autoSplit: true,
          linesClass: "line",
          wordsClass: "word",
          charsClass: "char",
          onSplit: (instance) =>
            gsap.from(instance[split], {
              yPercent: 110,
              duration: TIMING[split].duration,
              stagger: stagger ?? TIMING[split].stagger,
              delay,
              ease: "expo.out",
              immediateRender: true,
              // No clamp(): it pins the start to scroll 0, so text already on screen would wait for a scroll.
              scrollTrigger: playOnScroll ? { trigger: el, start: "top 92%", once: true } : undefined,
            }),
        });
      });
    });
    return () => {
      gone = true;
      ctx?.revert();
    };
  }, [split, delay, stagger, playOnScroll]);

  return (
    <Tag ref={ref} data-reveal="" {...rest}>
      {children}
    </Tag>
  );
}
