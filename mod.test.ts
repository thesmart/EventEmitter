import { describe, it } from '@std/testing/bdd';
import { assertEquals, assertThrows } from '@std/assert';
import {
  EventEmitter,
  NewListenerEvent,
  RemoveListenerEvent,
  TooManyListeners,
  UnhandledError,
} from './mod.ts';

describe('EventEmitter', () => {
  it('empty edge-case', () => {
    const emitter = new EventEmitter();
    emitter.emit('foobar');
    assertEquals(emitter.eventNames(), []);
    assertEquals(emitter.listenerCount(), 0);
    assertEquals(emitter.listenerCount('foobar'), 0);
    assertEquals(emitter.listenerCount('foobar', () => {}), 0);
    assertEquals(emitter.listeners('foobar'), []);
    emitter.removeEventListener('foobar', () => {});
    emitter.removeAllListeners('foobar');
    emitter.removeAllListeners();
  });

  it('allows adding and removing event listeners', () => {
    const emitter = new EventEmitter();
    // deno-lint-ignore no-explicit-any
    const listenerA = (...args: any[]) => {
    };
    // deno-lint-ignore no-explicit-any
    const listenerB = (...args: any[]) => {
    };

    assertEquals(emitter.addEventListener('one', listenerA), emitter);
    assertEquals(emitter.addEventListener('one', listenerA), emitter); // noop
    assertEquals(emitter.addEventListener('two', listenerA), emitter);
    assertEquals(emitter.addEventListener('two', listenerB), emitter);
    assertEquals(emitter.eventNames(), ['one', 'two']);
    assertEquals(emitter.listeners('one'), [listenerA]);
    assertEquals(emitter.listeners('two'), [listenerA, listenerB]);
    assertEquals(emitter.listenerCount('one'), 1);
    assertEquals(emitter.listenerCount('one', listenerA), 1);
    assertEquals(emitter.listenerCount('two'), 2);
    assertEquals(emitter.listenerCount('two', listenerA), 1);
    assertEquals(emitter.listenerCount('two', listenerB), 1);
    assertEquals(emitter.listenerCount('two', () => {}), 0);
    assertEquals(emitter.listenerCount(), 3);

    // does nothing, needs handler
    emitter.removeEventListener('two', listenerB);
    assertEquals(emitter.listeners('two'), [listenerA]);
    assertEquals(emitter.removeEventListener('two', () => {}), false);
    assertEquals(emitter.listeners('two'), [listenerA]);
    assertEquals(emitter.removeAllListeners('two'), true);
    assertEquals(emitter.removeAllListeners('two'), false);
    assertEquals(emitter.addEventListener('two', listenerA), emitter);
    assertEquals(emitter.removeEventListener('two', listenerB), false);
    assertEquals(emitter.removeEventListener('two', listenerA), true);
    assertEquals(emitter.listeners('two'), []);
    assertEquals(emitter.listeners('one'), [listenerA]);
    assertEquals(emitter.addEventListener('two', listenerA), emitter);
    assertEquals(emitter.addEventListener('two', listenerB), emitter);
    assertEquals(emitter.removeAllListeners(), true);
    assertEquals(emitter.listenerCount(), 0);
    assertEquals(emitter.listeners('one'), []);
    assertEquals(emitter.listeners('two'), []);
    assertEquals(emitter.removeAllListeners(), false);
  });

  it('emits events', () => {
    const emitter = new EventEmitter();
    // deno-lint-ignore no-explicit-any
    const log: { one: any[]; two: any[] } = { one: [], two: [] };
    // deno-lint-ignore no-explicit-any
    const listener = (event: string, ...args: any[]) => {
      log[event as keyof typeof log].push(args);
    };
    const throwUp = () => {
      throw Error('thrown up');
    };

    emitter.addEventListener('one', listener);
    emitter.addEventListener('two', listener);
    emitter.addEventListener('two', listener);
    assertEquals(emitter.emit('one'), true);
    assertEquals(emitter.emit('two'), true);
    assertEquals(emitter.emit('three'), false);
    assertEquals(log.one.length, 1);
    assertEquals(log.two.length, 1);

    assertThrows(
      () => {
        emitter.emit('error', 'hello world');
      },
      UnhandledError,
      'no handler',
      'Emitting an unhandled error should throw.',
    );

    assertThrows(
      () => {
        emitter.emit('error', new Error('foobar'));
      },
      Error,
      'foobar',
      'Emitting an unhandled error should throw.',
    );

    emitter.addEventListener('throw', throwUp);
    assertThrows(
      () => {
        emitter.emit('throw');
      },
      Error,
      'thrown up',
      'Errors thrown from a listener should bubble up.',
    );
  });

  it('emits events once', () => {
    const emitter = new EventEmitter();
    let counter = 0;
    const handler = (eventName: string) => {
      ++counter;
    };

    emitter.addEventListener('hit', handler, { once: true });
    emitter.addEventListener('hit', handler, { once: false });
    assertEquals(emitter.emit('hit'), true);
    assertEquals(emitter.emit('hit'), false);
    assertEquals(counter, 1);
  });

  it('has a limit to number of event listeners', () => {
    const emitter = new EventEmitter();
    for (let i = 0; i < emitter.maxListeners; ++i) {
      emitter.addEventListener('foobar', () => {});
    }
    assertThrows(() => {
      emitter.addEventListener('foobar', () => {});
    }, TooManyListeners);
    // this should not throw, abc is a new event type
    emitter.addEventListener('abc', () => {});
    // increase the limit
    emitter.maxListeners = 11;
    emitter.addEventListener('foobar', () => {});
    assertThrows(() => {
      emitter.addEventListener('foobar', () => {});
    }, TooManyListeners);
    assertThrows(() => {
      emitter.maxListeners = -1;
    }, Error);
    assertEquals(emitter.maxListeners, 11);
  });

  it('has new/remove events for adding/removing listeners', () => {
    const emitter = new EventEmitter();
    const counter = { count: 0, log: [] as (string | symbol)[] };
    emitter.addEventListener(NewListenerEvent, (e, args) => {
      assertEquals(e, NewListenerEvent);
      ++counter.count;
      counter.log.push(NewListenerEvent);
    });
    emitter.addEventListener(RemoveListenerEvent, (e, args) => {
      assertEquals(e, RemoveListenerEvent);
      --counter.count;
      counter.log.push(RemoveListenerEvent);
    });
    emitter.addEventListener('foobar', () => {});
    assertEquals(counter.count, 3);
    assertEquals(emitter.listenerCount(), 3);
    assertEquals(emitter.eventNames(), [
      'newListener',
      'removeListener',
      'foobar',
    ]);
    emitter.removeAllListeners();
    assertEquals(emitter.listenerCount(), 0);
    assertEquals(emitter.eventNames(), []);
    assertEquals(counter.count, 0);
    assertEquals(counter.log, [
      'newListener',
      'newListener',
      'newListener',
      'removeListener',
      'removeListener',
      'removeListener',
    ]);
  });
});
