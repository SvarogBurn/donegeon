import { describe, expect, it } from "vitest";
import type { NoteFolder } from "../types";
import { childrenOf, insideOf, pathTo, treeOrder } from "./noteFolders";

const folder = (id: string, parentId: string | null = null) => ({ id, name: id, color: null, parentId, position: 0 }) as NoteFolder;
// work > meetings > monday, work > ideas, home
const folders = [folder("work"), folder("meetings", "work"), folder("home"), folder("monday", "meetings"), folder("ideas", "work")];
const ids = (list: NoteFolder[]) => list.map((f) => f.id);

describe("childrenOf", () => {
  it("is the folders straight inside, in their order", () => {
    expect(ids(childrenOf(folders, null))).toEqual(["work", "home"]);
    expect(ids(childrenOf(folders, "work"))).toEqual(["meetings", "ideas"]);
    expect(ids(childrenOf(folders, "monday"))).toEqual([]);
  });
});

describe("pathTo", () => {
  it("goes from the top level down to the folder", () => {
    expect(ids(pathTo(folders, "monday"))).toEqual(["work", "meetings", "monday"]);
    expect(ids(pathTo(folders, "home"))).toEqual(["home"]);
    expect(pathTo(folders, null)).toEqual([]);
    expect(pathTo(folders, "gone")).toEqual([]);
  });
  it("stops at a loop rather than going round it", () => {
    expect(ids(pathTo([folder("a", "b"), folder("b", "a")], "a"))).toEqual(["b", "a"]);
  });
});

describe("insideOf", () => {
  it("is the folder and everything under it", () => {
    expect([...insideOf(folders, "work")].sort()).toEqual(["ideas", "meetings", "monday", "work"]);
    expect([...insideOf(folders, "meetings")].sort()).toEqual(["meetings", "monday"]);
    expect([...insideOf(folders, "home")]).toEqual(["home"]);
  });
});

describe("treeOrder", () => {
  it("lists each folder followed by the ones inside it", () => {
    expect(treeOrder(folders).map(({ folder, depth }) => `${folder.id}:${depth}`)).toEqual(["work:0", "meetings:1", "monday:2", "ideas:1", "home:0"]);
  });
  it("puts a folder whose parent is gone at the top level", () => {
    expect(treeOrder([folder("a", "gone"), folder("b", "a")]).map(({ folder, depth }) => `${folder.id}:${depth}`)).toEqual(["a:0", "b:1"]);
  });
});
