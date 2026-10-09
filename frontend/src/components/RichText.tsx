import type { ReactNode } from "react";
import { parseMarkup, type MarkupNode, type MarkupStyle } from "../lib/markup";

const WRAP: Record<MarkupStyle, (children: ReactNode, key: number) => ReactNode> = {
  bold: (children, key) => <b key={key} className="markup-bold">{children}</b>,
  italic: (children, key) => <i key={key} className="markup-italic">{children}</i>,
  underline: (children, key) => <u key={key}>{children}</u>,
  strike: (children, key) => <s key={key}>{children}</s>,
  mark: (children, key) => (
    <mark key={key} className="bg-yellow-200 px-0.5 text-stone-900 dark:bg-yellow-300">
      {children}
    </mark>
  ),
};

const render = (nodes: MarkupNode[]): ReactNode => nodes.map((node, key) => (typeof node === "string" ? node : WRAP[node.style](render(node.children), key)));

/** A task's title with its markup shown: **bold**, *italic*, __underline__, ==highlight==, ~~crossed out~~ (see lib/markup). */
export function RichText({ text }: { text: string }) {
  return <>{render(parseMarkup(text))}</>;
}
