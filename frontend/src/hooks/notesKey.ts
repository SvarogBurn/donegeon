import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import * as authApi from "../api/auth";
import * as notesApi from "../api/notes";
import { hasPlainWords, isSealed, newNotesKey, openKey, openNote, sealKey, usableKey, type SealedKey } from "../lib/noteCrypto";
import { deviceKey, forgetDeviceKey, keepDeviceKey } from "../lib/notesKey";
import { normalizeNotifications } from "../lib/notifySettings";
import type { NotesData } from "../lib/offline/noteChanges";
import type { User } from "../types";
import { useEditNote } from "./notes";
import { NOTES } from "./queryKeys";
import { ME, useMe } from "./useAuth";

/*
 * The Notes page's notes encrypted end to end (Settings › Theme and design › Encrypt notes; lib/noteCrypto): switched on
 * and off, the passphrase changed, and each device unlocked once. Everything but unlocking needs a connection.
 */

/** Whether the account's notes are encrypted. */
export function useNotesEncrypted(): boolean {
  return Boolean(useMe().user?.notesKey);
}

const WRONG_PASSPHRASE = "That isn't your notes passphrase.";

/** Every note asked for again, in full: what is kept was read with another key, or none. */
const reloadNotes = (queryClient: QueryClient) => {
  queryClient.setQueryData<NotesData>(NOTES, (data) => data && { ...data, syncedAt: undefined });
  return queryClient.invalidateQueries({ queryKey: NOTES });
};

/** The account's notes key, sealed, as this device last heard of it; an error when the notes aren't encrypted. */
function sealedKeyOf(queryClient: QueryClient): SealedKey {
  const sealed = queryClient.getQueryData<User | null>(ME)?.notesKey;
  if (!sealed) throw new Error("Your notes aren't encrypted.");
  return sealed;
}

/** This device opens the notes key with the passphrase, and keeps it: it isn't asked for here again. */
export function useUnlockNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (passphrase: string) => {
      const sealed = sealedKeyOf(queryClient);
      const raw = await openKey(sealed, passphrase);
      if (!raw) throw new Error(WRONG_PASSPHRASE);
      keepDeviceKey({ id: sealed.id, key: await usableKey(raw) });
    },
    onSuccess: () => reloadNotes(queryClient),
  });
}

/**
 * Encryption switched on: a new notes key, sealed with the passphrase, saved on the account and kept on this device;
 * then every note sealed. The key is saved first, so a note is never sealed with a key the server doesn't have.
 * A reminder that opens a note no longer keeps the note's title on the server.
 */
export function useEncryptNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (passphrase: string) => {
      const raw = newNotesKey();
      const id = crypto.randomUUID();
      const sealed = await sealKey(raw, id, passphrase);
      const key = await usableKey(raw);
      const notifications = normalizeNotifications(queryClient.getQueryData<User | null>(ME)?.notifications);
      const named = notifications.reminders.some((reminder) => reminder.linkTitle);
      const reminders = notifications.reminders.map(({ linkTitle: _, ...reminder }) => reminder);
      const user = await authApi.updateMe({ notesKey: sealed, ...(named && { notifications: { ...notifications, reminders } }) });
      keepDeviceKey({ id, key });
      queryClient.setQueryData(ME, user);
      const { notes } = await notesApi.listNotes();
      // updateNote seals them with the key kept above.
      for (const note of notes.filter(hasPlainWords)) await notesApi.updateNote(note.id, { title: note.title, text: note.text });
    },
    onSettled: () => reloadNotes(queryClient),
  });
}

/**
 * Encryption switched off: every note opened and saved unsealed, then the key taken off the account and this device.
 * Only from a device that was unlocked. Anything going wrong on the way leaves the key where it was.
 */
export function useDecryptNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const kept = await deviceKey();
      if (!kept) throw new Error("Unlock your notes on this device first.");
      const { notes } = await notesApi.listNotes();
      // Forgotten while the notes are saved, so updateNote doesn't seal them again.
      forgetDeviceKey();
      try {
        for (const note of notes.filter((n) => isSealed(n.title) || isSealed(n.text))) {
          const { title, text } = await openNote(kept.key, note);
          await notesApi.updateNote(note.id, { title, text });
        }
        queryClient.setQueryData(ME, await authApi.updateMe({ notesKey: null }));
      } catch (error) {
        keepDeviceKey(kept);
        throw error;
      }
    },
    onSettled: () => reloadNotes(queryClient),
  });
}

/** Another passphrase: the same notes key sealed again with it. The notes stay as they are, and other devices stay unlocked. */
export function useChangeNotesPassphrase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ old, next }: { old: string; next: string }) => {
      const sealed = sealedKeyOf(queryClient);
      const raw = await openKey(sealed, old);
      if (!raw) throw new Error(WRONG_PASSPHRASE);
      queryClient.setQueryData(ME, await authApi.updateMe({ notesKey: await sealKey(raw, sealed.id, next) }));
    },
  });
}

/**
 * The key this device keeps forgotten once the account has another one, or none (encryption switched off or on again on
 * another device): its notes are then asked for again, and show locked until it is unlocked with the new passphrase.
 */
export function useNotesKeyCheck() {
  const queryClient = useQueryClient();
  const user = useMe().user;
  // Undefined: not known yet (logged out, or an account kept from before there were notes keys).
  const id = user?.notesKey === undefined ? undefined : (user.notesKey?.id ?? null);
  useEffect(() => {
    if (id === undefined) return;
    void deviceKey().then((kept) => {
      if (!kept || kept.id === id) return;
      forgetDeviceKey();
      void reloadNotes(queryClient);
    });
  }, [id, queryClient]);
}

/**
 * The notes the server keeps unsealed though they are encrypted (written on a device that didn't know yet, or left
 * over when switching it on didn't finish), sealed now: saved again, sealed on the way (api/notes).
 */
export function useSealPlainNotes(data: NotesData | undefined) {
  const { mutate } = useEditNote();
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const id of data?.plain ?? []) {
      const note = data?.notes.find((n) => n.id === id);
      if (!note || asked.current.has(id)) continue;
      asked.current.add(id);
      mutate({ id, changes: { title: note.title, text: note.text } });
    }
  }, [data, mutate]);
}
