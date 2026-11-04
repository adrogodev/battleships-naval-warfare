/**
 * Minimal in-memory stand-in for the Web Audio API, used only by tests
 * (jsdom ships no AudioContext). It records created nodes, connections,
 * parameter automation and lifecycle calls so the engine can be asserted on.
 */

export interface ParamCall {
  readonly method: string;
  readonly args: readonly number[];
}

export class FakeParam {
  value: number;
  readonly calls: ParamCall[] = [];

  constructor(initial: number) {
    this.value = initial;
  }

  private record(method: string, args: number[], target?: number): this {
    this.calls.push({ method, args });
    if (target !== undefined) this.value = target;
    return this;
  }

  setValueAtTime(v: number, t: number): this {
    return this.record("setValueAtTime", [v, t], v);
  }

  linearRampToValueAtTime(v: number, t: number): this {
    return this.record("linearRampToValueAtTime", [v, t], v);
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    return this.record("exponentialRampToValueAtTime", [v, t], v);
  }

  setTargetAtTime(v: number, t: number, c: number): this {
    return this.record("setTargetAtTime", [v, t, c], v);
  }

  cancelScheduledValues(t: number): this {
    return this.record("cancelScheduledValues", [t]);
  }
}

export class FakeNode {
  readonly connections: (FakeNode | FakeParam)[] = [];
  disconnected = false;

  constructor(readonly kind: string) {}

  connect<T extends FakeNode | FakeParam>(dest: T): T {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor() {
    super("gain");
  }
}

class FakeScheduledSource extends FakeNode {
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  onended: (() => void) | null = null;

  start(t = 0): void {
    this.starts.push(t);
  }

  stop(t = 0): void {
    this.stops.push(t);
  }
}

export class FakeOscillator extends FakeScheduledSource {
  type = "sine";
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  constructor() {
    super("oscillator");
  }
}

export class FakeBufferSource extends FakeScheduledSource {
  buffer: unknown = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
  constructor() {
    super("bufferSource");
  }
}

export class FakeBiquad extends FakeNode {
  type = "lowpass";
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
  constructor() {
    super("biquad");
  }
}

export class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  constructor() {
    super("compressor");
  }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: "suspended" | "running" | "closed" = "suspended";
  readonly destination = new FakeNode("destination");
  readonly nodes: FakeNode[] = [];
  buffersCreated = 0;
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;

  private track<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  createGain(): FakeGain {
    return this.track(new FakeGain());
  }

  createOscillator(): FakeOscillator {
    return this.track(new FakeOscillator());
  }

  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource());
  }

  createBiquadFilter(): FakeBiquad {
    return this.track(new FakeBiquad());
  }

  createDynamicsCompressor(): FakeCompressor {
    return this.track(new FakeCompressor());
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    this.buffersCreated += 1;
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = "suspended";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

/** True when `from` feeds `target` through any chain of node connections. */
export function reaches(from: FakeNode, target: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return from.connections.some((c) => c instanceof FakeNode && reaches(c, target, seen));
}

export function isSource(node: FakeNode): node is FakeOscillator | FakeBufferSource {
  return node instanceof FakeOscillator || node instanceof FakeBufferSource;
}
