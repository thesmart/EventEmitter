import { Buffer } from '@std/io';

/**
 * A stream wrapper around a resizable buffer.
 * Call `bufferStream.writer()` to write to the buffer.
 */
export class BufferStream extends WritableStream {
  public buffer = new Buffer();

  constructor() {
    super({
      write: (chunk) => {
        this.buffer.write(chunk);
      },
    });
  }

  toString(): string {
    const data = new Uint8Array(this.buffer.length);
    this.buffer.readSync(data);
    return new TextDecoder().decode(data);
  }
}

/**
 * Pipe a readable stream into a writable stream.
 */
export async function pipeStream(
  reader: ReadableStream,
  writer: Deno.Writer | WritableStreamDefaultWriter,
) {
  for await (const chunk of reader) {
    await writer.write(chunk);
  }
}

const REGEX_COVERAGE =
  /^cover\s+file:\/\/(.*)(?=\s...\s)\s...\s[0-9\.]+%\s\(([0-9]+)\/([0-9]+)\)$/gm;

/**
 * Turns two numbers into a percentage to the hundredths place.
 */
function percentage(nom: number, denom: number): string {
  return (Math.round((nom / denom) * 10_000) / 100) + '%';
}

async function genCodeCoverageStats() {
  const command = new Deno.Command('deno', {
    env: {
      NO_COLOR: '1',
      // 'PATH': Deno.env.get('PATH')!,
    },
    args: ['coverage', '--detailed', '.profile'],
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
  });

  const child = command.spawn();

  const stdoutBufferStream = new BufferStream();
  pipeStream(child.stdout, stdoutBufferStream.getWriter());
  const stderrBufferStream = new BufferStream();
  pipeStream(child.stderr, stderrBufferStream.getWriter());

  const { success } = await child.status;
  if (!success) {
    const errOutput = stderrBufferStream.toString().trim();
    console.error(errOutput);
    throw new Error('Failed to generate code coverage stats.');
  }

  const output = stdoutBufferStream.toString().trim();

  // parse output
  const fileStats: {
    path: string;
    coveredLineCount: number;
    totalLineCount: number;
    percentage: string;
  }[] = [];
  let match: RegExpExecArray | null;

  while ((match = REGEX_COVERAGE.exec(output))) {
    const [_, path, coveredLineStr, totalLineStr] = match;
    const coveredLineCount = parseInt(coveredLineStr, 10);
    const totalLineCount = parseInt(totalLineStr, 10);
    fileStats.push({
      path,
      coveredLineCount,
      totalLineCount,
      percentage: percentage(coveredLineCount, totalLineCount),
    });
  }

  if (!fileStats.length) {
    console.error(output);
    throw new Error('Code coverage stats did not match regex.');
  }

  const nominator = fileStats.reduce(
    (acc, { coveredLineCount }) => acc + coveredLineCount,
    0,
  );
  const denominator = fileStats.reduce(
    (acc, { totalLineCount }) => acc + totalLineCount,
    0,
  );

  return {
    percentage: percentage(nominator, denominator),
    files: fileStats,
  };
}

const codeCoverage = await genCodeCoverageStats();
console.log(JSON.stringify(codeCoverage, undefined, '  '));
