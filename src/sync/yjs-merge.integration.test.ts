import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { describe, expect, it } from "vitest";

function mergedText(doc: Doc) {
  return doc.getText("shared").toString();
}

describe("Yjs deterministic merge integration", () => {
  it("produces identical merged state regardless of update apply order", () => {
    const stateA = new Doc();
    stateA.getText("shared").insert(0, "alpha");
    const encodedA = encodeStateAsUpdate(stateA);

    const stateB = new Doc();
    stateB.getText("shared").insert(0, "beta");
    const encodedB = encodeStateAsUpdate(stateB);

    const orderAB = new Doc();
    applyUpdate(orderAB, encodedA);
    applyUpdate(orderAB, encodedB);

    const orderBA = new Doc();
    applyUpdate(orderBA, encodedB);
    applyUpdate(orderBA, encodedA);

    expect(mergedText(orderAB)).toContain("alpha");
    expect(mergedText(orderAB)).toContain("beta");
    expect(mergedText(orderBA)).toContain("alpha");
    expect(mergedText(orderBA)).toContain("beta");
    expect(mergedText(orderAB)).toBe(mergedText(orderBA));
  });

  it("preserves concurrent inserts from separate replicas after sync", () => {
    const replicaA = new Doc();
    const replicaB = new Doc();

    replicaA.getText("shared").insert(0, "left-");
    replicaB.getText("shared").insert(0, "right-");

    const updateA = encodeStateAsUpdate(replicaA);
    const updateB = encodeStateAsUpdate(replicaB);

    const server = new Doc();
    applyUpdate(server, updateA);
    applyUpdate(server, updateB);

    const clientAfterPull = new Doc();
    applyUpdate(clientAfterPull, encodeStateAsUpdate(server));

    expect(mergedText(clientAfterPull)).toContain("left-");
    expect(mergedText(clientAfterPull)).toContain("right-");
  });
});
