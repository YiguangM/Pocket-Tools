import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import "./Step.css";

type StepProps = {
  /** Used for the heading id; must be unique on the page. */
  id: string;
  number: string;
  label: string;
  title: string;
  /** Extra line under the heading, such as keyboard help. */
  aside?: ReactNode;
  children: ReactNode;
};

/** One numbered stage of a tool ("01 · Add", "02 · Arrange", ...). */
export function Step({ id, number, label, title, aside, children }: StepProps) {
  return (
    <section className="step" aria-labelledby={id}>
      <div className="step-head">
        <span className="step-no">
          {number} &middot; {label}
        </span>
        <Reveal as="h2" id={id} split="words" playOnScroll>
          {title}
        </Reveal>
        {aside}
      </div>
      {children}
    </section>
  );
}
