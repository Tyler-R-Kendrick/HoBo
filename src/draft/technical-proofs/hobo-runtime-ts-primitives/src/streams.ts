export function getWritable<T>(): WritableStream<T> {
  return new WritableStream<T>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
}

const chunks: unknown[] = [];

export function drainWritableForTests(): unknown[] {
  const copy = [...chunks];
  chunks.length = 0;
  return copy;
}

export function getReadableFromRun(): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}
