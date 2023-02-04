import { ResolveFunction } from '@typed-doc/core';
import { CompiledQuery } from 'kysely';
import { execute as dbExec } from '@/db';
import { defineEvent, Effects, Event, EventDefinition, OutputEvent } from '@/utils/ddd';
import { Static, TSchema } from '@sinclair/typebox';

export const DEFAULT_EXECUTOR = (commands: CompiledQuery[]) => dbExec(commands);

interface CommanderResolveFunction<Context = any, Input = any, Output = any> {
  (params: { context: Context; input: Input; commander: Commander<CompiledQuery, Context> }): Promise<Output> | Output;
}

export interface Entity {
  id: string;
  version: number;
}

export type MapEventsResult<TEvent, TCommand> = { entity: Entity; commands: TCommand[]; events: OutputEvent<TEvent>[] };

export type ActionResult<Name extends string, Data> = {
  event: Event<Name, Data>;
  effects: CompiledQuery[];
};

export function createActionBatcher() {
  const _commands: CompiledQuery[] = [];

  return {
    add: (...result: ActionResult<string, any>[]) => {
      const cmds = result.map((r) => r.effects).flat();
      _commands.push(...cmds);
    },
    popAll: () => {
      const cmds = [..._commands];
      _commands.length = 0;
      return cmds;
    },
  };
}

/**
 * Define an action
 */
export const defineAction =
  <TName extends string, T extends TSchema>(eventDefinition: EventDefinition<TName, T>) =>
  <TState, TContext>(props: {
    effects: (event: OutputEvent<Event<TName, Static<T>>>, context: TContext) => CompiledQuery[];
    invariant?: (state: TState, input: Static<T>) => void;
  }) => {
    const { effects: mapToEffects, invariant } = props;
    const factory = defineEvent(eventDefinition);

    return function from(props: {
      entity: Entity;
      state: TState;
      input: Static<T>;
      context: TContext;
    }): ActionResult<TName, Static<T>> {
      if (invariant) {
        invariant(props.state, props.input);
      }

      // create event
      const event = factory(props.input);

      const outputEvent: OutputEvent<Event<TName, Static<T>>> = {
        _agg_id: props.entity.id,
        _version: props.entity.version,
        data: event.data,
        event_name: event.event_name,
      };

      const effects = mapToEffects(outputEvent, props.context);

      return {
        event,
        effects,
      } as const;
    };
  };

export type Commander<TCommand, Ctx> = {
  /**
   * Emit events. Adds resulting events & command to the batch
   * @param events
   * @param props
   * @returns
   */
  emit: <TEvent extends Event<string, {}>>(
    events: ReadonlyArray<TEvent> | TEvent,
    props: {
      entity: Entity;
      effects: Effects<TEvent, TCommand[], Ctx>;
    }
  ) => Entity;
  /**
   * Add commands to the current batch
   * @param commands
   * @returns
   */
  add: (...commands: TCommand[]) => void;
  /**
   * Add commands & events from external emit. Should be used in combination with `mapEvents` function
   * @param result
   * @returns
   */
  addFrom: <TEvent extends Event<string, {}>>(result: MapEventsResult<TEvent, TCommand>) => Entity;
  /**
   * Flushes the current batch of commands and events using the provided executor
   * @returns
   */
  execute: () => Promise<any>;
  /**
   * Get current commands in the commander
   */
  getCommands(): TCommand[];
  /**
   * Get current events in the commander
   */
  getEvents(): Array<OutputEvent<Event>>;
};

/**
 * Wraps resolve function and adds commander, after the resolve function is resolved, automaticaly commits and flushes all pending commands & events
 * @param resolve
 * @returns
 */
export function withCommander<Context = any, Input = any, Output = any>(
  resolve: CommanderResolveFunction<Context, Input, Output>,
  executor?: Executor<CompiledQuery>
): ResolveFunction<Context, Input, Output> {
  return async function resolveWithCommander(props) {
    const commander = createCommander(props.context, executor ?? DEFAULT_EXECUTOR);
    const result = await resolve({ context: props.context, input: props.input, commander });
    await commander.execute();
    return result;
  };
}

type Executor<T> = (commands: T[]) => Promise<void>;

export function mapEvents<TEvent extends Event, TCommand, Context>(
  events: ReadonlyArray<TEvent> | TEvent,
  props: {
    context: Context;
    entity: Entity;
    effects: Effects<TEvent, TCommand[], Context>;
  }
): MapEventsResult<TEvent, TCommand> {
  const _events = Array.isArray(events) ? events : [events];

  if (_events.length === 0) {
    return { entity: props.entity, commands: [], events: [] };
  }

  const outEvents = _events.map<OutputEvent<TEvent>>((e, idx) => ({
    _agg_id: props.entity.id,
    _version: props.entity.version + 1 + idx,
    ...e,
  }));

  const resultingCommands = outEvents
    .map<TCommand[]>((e) => (props.effects as any)[e.event_name](e, props.context))
    .flat();
  const lastEvent = outEvents[outEvents.length - 1]!;

  return {
    entity: { id: lastEvent._agg_id, version: lastEvent._version },
    commands: resultingCommands,
    events: outEvents,
  };
}

export function createCommander<TCommand, Ctx>(ctx: Ctx, executor: Executor<TCommand>): Commander<TCommand, Ctx> {
  const _commands: Array<TCommand> = [];
  const _events: Array<OutputEvent<Event>> = [];

  function addFrom<TEvent extends Event>(result: MapEventsResult<TEvent, TCommand>) {
    _commands.push(...result.commands);
    _events.push(...result.events);

    return result.entity;
  }

  function emit<TEvent extends Event>(
    events: ReadonlyArray<TEvent> | TEvent,
    props: {
      entity: Entity;
      effects: Effects<TEvent, TCommand[], Ctx>;
    }
  ): Entity {
    const result = mapEvents(events, { context: ctx, effects: props.effects, entity: props.entity });
    return addFrom(result);
  }

  return {
    emit,
    addFrom,
    add: (...cmds) => {
      _commands.push(...cmds);
    },
    execute: async function execute() {
      const cmds = [..._commands];
      _commands.length = 0;
      _events.length = 0;

      if (cmds.length === 0) {
        return;
      }

      await executor(cmds);
    },
    getCommands() {
      return [..._commands];
    },
    getEvents(): Array<OutputEvent<Event>> {
      return [..._events];
    },
  };
}
