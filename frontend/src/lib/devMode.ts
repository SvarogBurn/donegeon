import { readStored, writeStored } from "./storage";

const DEV_MODE_KEY = "donegeon.devMode";

/**
 * The hidden dev mode: every body and piece may be worn in the character editor, nothing earned. Nobody has it by
 * default, developers included; seven quick taps on the character in the editor switch it on or off, on this device.
 */
export const readDevMode = () => readStored(DEV_MODE_KEY) === "1";

export const writeDevMode = (on: boolean) => writeStored(DEV_MODE_KEY, on ? "1" : null);
