/**
 * Who caused a change. Events carry it so a host can tell its own updates
 * from the user's — and, say, not save back what it has just loaded.
 */
export type ChangeSource = 'user' | 'host' | 'api' | 'data';
