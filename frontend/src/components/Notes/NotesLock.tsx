import { useState, type FormEvent, type ReactNode } from "react";
import { useChangeNotesPassphrase, useDecryptNotes, useEncryptNotes, useNotesEncrypted, useUnlockNotes } from "../../hooks/notesKey";
import { PixelCheckbox } from "../PixelCheckbox";

const FIELD = "w-full border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";
/** The shortest notes passphrase taken. */
const MIN_PASSPHRASE = 8;

/** A passphrase field: hidden as it is typed, and never filled in or corrected by the browser. */
function Passphrase({ label, value, onChange, autoFocus = false, name }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean; name: string }) {
  return (
    <label className="block space-y-1 text-xs">
      <span>{label}</span>
      <input
        className={FIELD}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        {...{ [`data-${name}`]: true }}
      />
    </label>
  );
}

/**
 * The Notes page on a device that hasn't opened the notes key yet (lib/noteCrypto): the notes passphrase opens it, and
 * the device keeps it. Works offline, with the account kept on the device.
 */
export function NotesLock() {
  const [passphrase, setPassphrase] = useState("");
  const unlock = useUnlockNotes();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (passphrase && !unlock.isPending) unlock.mutate(passphrase);
  };
  return (
    <form onSubmit={submit} className="card mx-auto w-96 max-w-full space-y-3 text-xs" data-notes-lock>
      <p className="text-sm">Your notes are encrypted</p>
      <p>Type your notes passphrase to read them on this device. It only has to be typed once here.</p>
      <Passphrase label="Notes passphrase" value={passphrase} onChange={setPassphrase} autoFocus name="notes-unlock" />
      {unlock.error && <p className="text-red-600">{unlock.error.message}</p>}
      <div className="flex justify-end">
        <button type="submit" className={`nes-btn btn-small ${passphrase ? "is-primary" : "is-disabled"}`} disabled={!passphrase || unlock.isPending}>
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </form>
  );
}

/** A small form under the setting: its fields, its error, and Cancel beside its button. */
function SettingForm({ onSubmit, onCancel, isPending, error, button, children, name }: { onSubmit: () => void; onCancel: () => void; isPending: boolean; error: Error | null; button: string; children: ReactNode; name: string }) {
  return (
    <form
      className="space-y-2 border-l-4 border-stone-300 pl-3 dark:border-stone-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isPending) onSubmit();
      }}
      onKeyDown={(e) => e.key === "Escape" && !isPending && onCancel()}
      {...{ [`data-${name}`]: true }}
    >
      {children}
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      <div className="flex justify-end">
        <button type="button" className="nes-btn btn-small" disabled={isPending} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="nes-btn btn-small is-primary" disabled={isPending}>
          {button}
        </button>
      </div>
    </form>
  );
}

/** The new passphrase typed twice; an error to show, or null when it will do. */
function newPassphraseProblem(next: string, again: string): string | null {
  if (next.length < MIN_PASSPHRASE) return `A notes passphrase is at least ${MIN_PASSPHRASE} characters.`;
  if (next !== again) return "The two passphrases aren't the same.";
  return null;
}

/**
 * Settings › Theme and design › Encrypt notes: switching it on (a passphrase, typed twice), changing the passphrase,
 * and switching it off (the notes saved readable again). Each needs a connection; the settings box greys it out without.
 */
export function NotesEncryption() {
  const isEncrypted = useNotesEncrypted();
  const encrypt = useEncryptNotes();
  const decrypt = useDecryptNotes();
  const change = useChangeNotesPassphrase();
  const [open, setOpen] = useState<"on" | "off" | "change" | null>(null);
  const [old, setOld] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setOpen(null);
    setOld("");
    setNext("");
    setAgain("");
    setProblem(null);
    encrypt.reset();
    decrypt.reset();
    change.reset();
  };
  const withNew = (go: () => void) => () => {
    const wrong = newPassphraseProblem(next, again);
    setProblem(wrong);
    if (!wrong) go();
  };
  const problemError = problem ? new Error(problem) : null;

  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={isEncrypted} disabled={open !== null} onChange={() => setOpen(isEncrypted ? "off" : "on")} data-notes-encrypt />
        Encrypt notes
      </label>
      <p className="text-xs text-stone-500">
        {isEncrypted
          ? "Your notes are encrypted on your devices before they are sent: the server only keeps what it can't read. Each device asks for your notes passphrase once. Notes on tasks aren't encrypted."
          : "Your notes are kept on the server as you wrote them. Encrypted, only your devices could read them, with a passphrase of their own."}
      </p>
      {isEncrypted && open === null && (
        <button type="button" className="nes-btn btn-small" onClick={() => setOpen("change")} data-notes-passphrase-change>
          Change the passphrase
        </button>
      )}
      {open === "on" && (
        <SettingForm name="notes-encrypt-form" button={encrypt.isPending ? "Encrypting…" : "Encrypt"} isPending={encrypt.isPending} error={problemError ?? encrypt.error} onCancel={close} onSubmit={withNew(() => encrypt.mutate(next, { onSuccess: close }))}>
          <p className="text-xs text-red-600 dark:text-red-400">If you forget this passphrase, your notes can't be read again, by anyone. Keep it somewhere safe.</p>
          <Passphrase label="Notes passphrase" value={next} onChange={setNext} autoFocus name="notes-passphrase" />
          <Passphrase label="The same again" value={again} onChange={setAgain} name="notes-passphrase-again" />
        </SettingForm>
      )}
      {open === "change" && (
        <SettingForm
          name="notes-change-form"
          button={change.isPending ? "Changing…" : "Change"}
          isPending={change.isPending}
          error={problemError ?? change.error}
          onCancel={close}
          onSubmit={withNew(() => change.mutate({ old, next }, { onSuccess: close }))}
        >
          <Passphrase label="Your notes passphrase" value={old} onChange={setOld} autoFocus name="notes-passphrase-old" />
          <Passphrase label="The new one" value={next} onChange={setNext} name="notes-passphrase" />
          <Passphrase label="The new one again" value={again} onChange={setAgain} name="notes-passphrase-again" />
        </SettingForm>
      )}
      {open === "off" && (
        <SettingForm name="notes-decrypt-form" button={decrypt.isPending ? "Decrypting…" : "Decrypt"} isPending={decrypt.isPending} error={decrypt.error} onCancel={close} onSubmit={() => decrypt.mutate(undefined, { onSuccess: close })}>
          <p className="text-xs">Decrypt your notes? The server will keep them as you wrote them again, and the passphrase is forgotten.</p>
        </SettingForm>
      )}
    </>
  );
}
