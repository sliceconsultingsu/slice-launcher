// Everything the app's screens, API routes and assistant tools need to work with alumni data,
// built from one database handle. Handlers receive this object as an argument, so tests can pass
// one built on a disposable test database. Only database.ts builds it from the real database.
import { AlumniReads } from "./reads";
import { AlumniStore, type StoreOptions } from "./store";
import { StudentStore } from "./students";

export type AlumniDatabase = Pick<D1Database, "prepare" | "batch">;

export interface AlumniData {
  db: AlumniDatabase;
  store: AlumniStore;
  students: StudentStore;
  reads: AlumniReads;
  /** The current time as UTC ISO-8601 text. Tests fix it. */
  now(): string;
  newId(): string;
}

export function alumniData(db: AlumniDatabase, options: StoreOptions = {}): AlumniData {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => crypto.randomUUID());
  return {
    db,
    store: new AlumniStore(db, { now, newId }),
    students: new StudentStore(db, { now, newId }),
    reads: new AlumniReads(db),
    now,
    newId,
  };
}
