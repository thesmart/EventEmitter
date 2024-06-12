# EventEmitter

A partial port of
[Node's EventEmitter](https://github.com/nodejs/node/blob/main/lib/events]js#L221)
class in TypeScript for Deno.

Goals of this project:

- Keep it super simple.
- Full test coverage.
- Least surprises.

Example:

```ts
import { EventEmitter } from `jsr:@thesmart/event-emitter`

class MyClass extends EventEmitter {
  constructor() {
    super();
  }
}

interface MyEventData {
  time: Date
}

const emitter = new MyClass();
emitter.addEventListener('ping', (event: string, data: MyEventData) => {
  // handler code here, this will get called once only
}, { once: true });
emitter.emit('ping', { time: new Date() });
```
