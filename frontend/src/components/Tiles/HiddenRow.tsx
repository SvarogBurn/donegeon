/** The boxes minimized away, offered again in a row under the grid; a click brings one back where it was. */
export function HiddenRow({ tiles, onShow }: { tiles: { key: string; label: string }[]; onShow: (key: string) => void }) {
  if (tiles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs" role="group" aria-label="Hidden boxes">
      <span className="text-stone-500">Hidden:</span>
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          className="pixel-chip cursor-pointer bg-stone-200 px-2 py-1 hover:bg-white dark:bg-stone-700 dark:hover:bg-stone-600"
          title="Show this box again, where it was"
          onClick={() => onShow(tile.key)}
        >
          {tile.label}
        </button>
      ))}
    </div>
  );
}
