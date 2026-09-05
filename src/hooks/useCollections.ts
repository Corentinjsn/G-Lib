import { useCallback, useEffect, useState } from "react";
import {
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
  setCollectionMembership,
} from "../lib/api";
import type { Collection } from "../types";

/**
 * Owns the user's lists. Every backend call answers with the whole list, so
 * state is replaced rather than patched -- there is no local copy to drift out
 * of step with the file on disk.
 */
export function useCollections(onError: (message: string) => void) {
  const [collections, setCollections] = useState<Collection[]>([]);

  /** Returns the new list so callers can chain, e.g. create then add a game. */
  const run = useCallback(
    async (
      action: () => Promise<Collection[]>,
      failure: string,
    ): Promise<Collection[] | null> => {
      try {
        const next = await action();
        setCollections(next);
        return next;
      } catch (cause) {
        onError(`${failure} : ${cause}`);
        return null;
      }
    },
    [onError],
  );

  useEffect(() => {
    void run(listCollections, "Listes illisibles");
  }, [run]);

  return {
    collections,
    create: (name: string) =>
      run(() => createCollection(name), "Impossible de créer la liste"),
    rename: (id: string, name: string) =>
      run(() => renameCollection(id, name), "Impossible de renommer la liste"),
    remove: (id: string) =>
      run(() => deleteCollection(id), "Impossible de supprimer la liste"),
    setMembership: (id: string, gameId: string, member: boolean) =>
      run(
        () => setCollectionMembership(id, gameId, member),
        "Impossible de modifier la liste",
      ),
  };
}
