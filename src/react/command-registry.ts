import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

/**
 * Single command registered with the palette (per ADR-0007).
 *
 * A command may be either:
 *   - **static** — fixed entry shown unconditionally (navigation, recent),
 *     selected via `run(ctx)`.
 *   - **provider** — async function returning more commands for the
 *     current query. The palette invokes providers with debounce on every
 *     keystroke; results merge into the static list.
 */
export interface Command {
    /** Stable, app-scoped (e.g. `"crm.nav.contacts"`). Used for dedup + keys. */
    id: string;
    title: string;
    subtitle?: string | null;
    /** UI grouping label. Free-form. */
    group?: string;
    /** Icon name (Lucide) or URL. */
    icon?: string | null;
    /** Extra match terms. */
    keywords?: readonly string[];
    /** Optional display-only keyboard hint, e.g. `"g c"`. */
    shortcut?: string | null;
    /** Optional ranking hint; higher = closer to top. */
    score?: number | null;
    /** Action invoked on selection (skip for provider entries). */
    run?: (ctx: CommandRunContext) => void | Promise<void>;
    /** Async provider — return commands matching the user's query. */
    provider?: (query: string) => Promise<Command[]>;
}

export interface CommandRunContext {
    /** Closes the palette. */
    close: () => void;
}

export interface CommandRegistryValue {
    /** All currently-registered commands across providers. */
    commands: Command[];
    /** Internal: incremented when registrations change. */
    version: number;
}

const CommandRegistryContext = createContext<{
    register: (commands: Command[]) => () => void;
    snapshot: () => Command[];
    subscribe: (listener: () => void) => () => void;
} | null>(null);
CommandRegistryContext.displayName = 'AbeonCommandRegistry';

export interface CommandRegistryProviderProps {
    children: ReactNode;
}

/**
 * Root registry for the command palette. Mount once near the AbeonProvider
 * (or inside `<AppShell>` which composes it).
 *
 * Components call `useRegisterCommands(commands)` to add commands; the
 * registration unsubscribes on unmount. The palette UI in `@abeon/ui` calls
 * `useCommandRegistry()` to read the live list.
 */
export function CommandRegistryProvider({
    children,
}: CommandRegistryProviderProps): ReactNode {
    const registrations = useRef<Map<symbol, Command[]>>(new Map());
    const listeners = useRef<Set<() => void>>(new Set());

    const notify = useCallback(() => {
        for (const listener of listeners.current) listener();
    }, []);

    const register = useCallback(
        (commands: Command[]): (() => void) => {
            const token = Symbol('cmd-reg');
            registrations.current.set(token, commands);
            notify();
            return () => {
                registrations.current.delete(token);
                notify();
            };
        },
        [notify],
    );

    const snapshot = useCallback((): Command[] => {
        const flat: Command[] = [];
        for (const entries of registrations.current.values()) {
            for (const command of entries) flat.push(command);
        }
        return dedupeById(flat);
    }, []);

    const subscribe = useCallback((listener: () => void): (() => void) => {
        listeners.current.add(listener);
        return () => {
            listeners.current.delete(listener);
        };
    }, []);

    const value = useMemo(
        () => ({ register, snapshot, subscribe }),
        [register, snapshot, subscribe],
    );

    return createElement(CommandRegistryContext.Provider, { value }, children);
}

/**
 * Register commands from any component inside `<CommandRegistryProvider>`.
 * Re-registers when `commands` changes by identity — wrap in `useMemo` to
 * keep registration stable.
 */
export function useRegisterCommands(commands: Command[]): void {
    const ctx = useContext(CommandRegistryContext);
    if (!ctx) {
        throw new Error(
            '@abeon/shared/react: useRegisterCommands() must be used inside <CommandRegistryProvider>',
        );
    }
    useEffect(() => {
        if (commands.length === 0) return;
        const unregister = ctx.register(commands);
        return unregister;
    }, [ctx, commands]);
}

/**
 * Read the live registry. Subscribes to changes — palette UI re-renders on
 * register/unregister.
 */
export function useCommandRegistry(): CommandRegistryValue {
    const ctx = useContext(CommandRegistryContext);
    if (!ctx) {
        throw new Error(
            '@abeon/shared/react: useCommandRegistry() must be used inside <CommandRegistryProvider>',
        );
    }
    const [version, setVersion] = useState<number>(0);
    useEffect(() => {
        const unsub = ctx.subscribe(() => setVersion((v) => v + 1));
        // Initial sync — covers the case where `useRegisterCommands` effects
        // ran before this hook's subscribe effect (mount-order race).
        setVersion((v) => v + 1);
        return unsub;
    }, [ctx]);

    const commands = useMemo<Command[]>(() => ctx.snapshot(), [ctx, version]);

    return { commands, version };
}

function dedupeById(commands: Command[]): Command[] {
    const seen = new Set<string>();
    const result: Command[] = [];
    for (const c of commands) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        result.push(c);
    }
    return result;
}
