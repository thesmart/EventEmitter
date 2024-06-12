// Copyright 2024 John Smart. All rights reserved. MIT license.
// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// Copyright (c) 2019 Denolibs authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

export class UnhandledError extends Error {
  constructor(
    msg: string = "An 'error' event was emitted, but there is no handler.",
  ) {
    super(msg);
  }
}

export class TooManyListeners extends Error {
  constructor(
    msg: string = 'Too many listeners have been added to this EventEmitter.',
  ) {
    super(msg);
  }
}

/**
 * The default maximum number of listeners that are allowed to listen to a
 * single event on an EventEmitter before and error is thrown.
 */
export const DEFAULT_MAX_LISTENERS = 10;

// deno-lint-ignore no-explicit-any
type GenericFunction = (...args: any[]) => any;

interface EventListenerMeta {
  options?: EventListenerOptions;
}

interface EventListenerOptions {
  once?: boolean;
}

/**
 * An EventEmitter can emit events and also have event listeners.
 *
 * All EventEmitters emit the event 'newListener' when new listeners are
 * added and 'removeListener' when existing listeners are removed.
 *
 * A partial implementation of https://nodejs.org/api/events.html
 */
export class EventEmitter {
  private _maxListeners: number = DEFAULT_MAX_LISTENERS;
  private _listeners: Map<
    string | symbol,
    Set<GenericFunction>
  > = new Map();
  private _listenerMeta = new Map<
    string | symbol,
    Map<
      GenericFunction,
      EventListenerMeta
    >
  >();

  constructor() {
  }

  get maxListeners(): number {
    return this._maxListeners;
  }

  set maxListeners(n: number) {
    if (n < 0) {
      throw new Error('Tried to set negative value for maxListeners.');
    }
    this._maxListeners = n;
  }

  /**
   * Call `listener` with the arguments passed to `emit` whenever `eventName`
   * is emitted.
   *
   * Adds a function to the list of event listeners for the specified event
   * type on the EventTarget on which it's called. If the function or object
   * is already in the list of event listeners for this target, the function
   * is not added a second time.
   */
  addEventListener(
    eventName: string | symbol,
    listener: GenericFunction,
    options?: EventListenerOptions,
  ): this {
    let listenerSet: Set<GenericFunction>;
    if (this._listeners.has(eventName)) {
      listenerSet = this._listeners.get(eventName)!;
    } else {
      listenerSet = new Set();
      this._listeners.set(eventName, listenerSet);
    }

    if (listenerSet.has(listener)) {
      // already listening
      return this;
    } else if (listenerSet.size >= this._maxListeners) {
      throw new TooManyListeners();
    }

    listenerSet.add(listener);

    let meta: EventListenerMeta;
    let metaMap: Map<GenericFunction, EventListenerMeta>;
    if (this._listenerMeta.has(eventName)) {
      metaMap = this._listenerMeta.get(eventName)!;
      if (metaMap.has(listener)) {
        // do nothing, do not override meta defined first elsewhere
        // this line should be unreachable
      } else {
        meta = { options };
        metaMap.set(listener, meta);
      }
    } else {
      meta = { options };
      metaMap = new Map<GenericFunction, EventListenerMeta>();
      metaMap.set(listener, meta);
      this._listenerMeta.set(eventName, metaMap);
    }

    this.emit('newListener', eventName, listener, options);
    return this;
  }

  /**
   * Removes an event listener previously registered with
   * `EventTarget.addEventListener()` from the target. The event listener to be
   * removed is identified using a combination of the event type, and the event
   * listener function.
   *
   * @returns True if removed, false if not found.
   */
  removeEventListener(
    eventName: string | symbol,
    listener: GenericFunction,
  ): boolean {
    const listenerSet = this._listeners.get(eventName);
    if (!listenerSet) {
      return false;
    } else if (!listenerSet.has(listener)) {
      return false;
    }

    this.emit('removeListener', eventName, listener);
    listenerSet.delete(listener);
    this._listenerMeta.get(eventName)?.delete(listener);

    return true;
  }

  /**
   * Removes all listeners from the event emitter. Only removes listeners for
   * a specific event name if specified.
   * @returns True if removed, false if not found.
   */
  removeAllListeners(eventName?: string | symbol): boolean {
    if (!eventName) {
      // remove all events in reverse order
      const reversedEvents = Array.from(this._listeners.keys()).reverse();
      for (const key of reversedEvents) {
        this.removeAllListeners(key);
      }
      return reversedEvents.length > 0;
    }

    const listenerSet = this._listeners.get(eventName);
    if (!listenerSet) {
      return false;
    }

    this._listeners.delete(eventName);
    this._listenerMeta.delete(eventName);
    const reversedListeners = Array.from(listenerSet).reverse();
    for (const listener of reversedListeners) {
      this.emit('removeListener', eventName, listener);
    }
    return true;
  }

  /**
   * Synchronously calls each of the listeners registered for the event named
   * eventName, in the order they were registered, passing the supplied
   * arguments to each.
   * @return true if the event had listeners, false otherwise
   */
  // deno-lint-ignore no-explicit-any
  public emit(eventName: string | symbol, ...args: any[]): boolean {
    if (!this._listeners.has(eventName)) {
      if (eventName === 'error') {
        if (args[0] instanceof Error) {
          throw args[0];
        } else {
          throw new UnhandledError();
        }
      }
      return false;
    }

    const listenerSet = this._listeners.get(eventName)!;
    const listenerSetSize = listenerSet.size;
    for (const listener of listenerSet) {
      try {
        const _args = Array.from(args);
        _args.unshift(eventName);
        listener.apply(this, _args);
      } catch (err) {
        this.emit('error', err);
      } finally {
        const listenerMeta = this._listenerMeta.get(eventName)?.get(listener);
        if (listenerMeta?.options?.once) {
          this.removeEventListener(eventName, listener);
        }
      }
    }

    return listenerSetSize > 0 ? true : false;
  }

  /**
   * Returns an array listing the events for which the emitter has registered
   * listeners.
   */
  public eventNames(): (string | symbol)[] {
    const list: (string | symbol)[] = [];
    for (const key of this._listeners.keys()) {
      list.push(key);
    }
    return list;
  }

  /**
   * @returns the number of listeners listening for the event
   * named eventName. If listener is provided, it will return 0 or 1 depending
   * on if that listener is registered for the event.
   */
  public listenerCount(
    eventName?: string | symbol,
    listener?: GenericFunction,
  ): number {
    if (!eventName) {
      let count = 0;
      for (const eventName of this.eventNames()) {
        count += this.listenerCount(eventName);
      }
      return count;
    }

    const listenerSet = this._listeners.get(eventName);
    if (!listenerSet) {
      return 0;
    } else if (listener) {
      return listenerSet.has(listener) ? 1 : 0;
    } else {
      return listenerSet.size;
    }
  }

  /**
   * Returns a copy of the array of listeners for the event named eventName.
   */
  public listeners(eventName: string | symbol): GenericFunction[] {
    const list: GenericFunction[] = [];
    const listenerSet = this._listeners.get(eventName);
    if (listenerSet) {
      for (const fn of listenerSet) {
        list.push(fn);
      }
    }
    return list;
  }
}
