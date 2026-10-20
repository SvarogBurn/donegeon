/** The answer to "Delete this …?": Delete, red, or Keep, quiet. Each place asking it lays the question out its own way. */
export function DeleteOrKeep({ onDelete, onKeep }: { onDelete: () => void; onKeep: () => void }) {
  return (
    <>
      <button type="button" className="nes-btn is-error btn-small" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="btn-quiet" onClick={onKeep}>
        Keep
      </button>
    </>
  );
}
