import type { ReactNode } from "react";
import "./ChoiceCard.css";

type ChoiceCardProps<T extends string> = {
  /** Radio group name; unique per group on the page (useId helps). */
  name: string;
  value: T;
  current: T;
  onPick: (value: T) => void;
  title: string;
  /** Description or inline controls. Inputs here stay clickable above the card. */
  children?: ReactNode;
};

/** One option of a radio group drawn as a card; the whole card is the click target. Put cards in a `.choices` grid. */
export function ChoiceCard<T extends string>({ name, value, current, onPick, title, children }: ChoiceCardProps<T>) {
  return (
    <div className="choice">
      <label>
        <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} />
        <strong>{title}</strong>
      </label>
      {children}
    </div>
  );
}
