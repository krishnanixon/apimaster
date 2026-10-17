/**
 * Runs untrusted pre-request / test scripts in a QuickJS (WebAssembly) interpreter.
 *
 * node:vm is not a security boundary: any host object handed to a vm context leaks the host
 * realm's Function constructor, and with it `process` and `require`. Here the guest has its
 * own heap and no host functions at all — the only things crossing the boundary are a JSON
 * string going in and a JSON string coming out.
 *
 * The interpreter lives in a worker thread so a script can never stall the main process.
 * QuickJS's own interrupt handler enforces the timeout and keeps partial results, but it only
 * fires every few thousand operations, so a script looping over expensive built-ins could
 * overrun it; the worker is terminated outright if it is still busy shortly after the deadline.
 */
import { createRequire } from 'node:module'
import { sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { GUEST_PRELUDE } from './script-guest'

export const SCRIPT_TIMEOUT_MS = 2000
export const SCRIPT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024
const SCRIPT_MAX_STACK_BYTES = 1024 * 1024
/** Time for collecting results after a script used up (or overran) its own budget. */
const FINISH_TIMEOUT_MS = 500
/** How long past the deadline before the worker is killed instead of waiting for QuickJS. */
const HARD_KILL_GRACE_MS = 1000

export interface SandboxRunOptions {
  /** JSON passed to the guest prelude (variables, response, …). */
  input: string
  script: string
  filename: string
  timeoutMs?: number
  memoryLimitBytes?: number
}

export interface SandboxRunOutcome {
  /** JSON string produced by the guest's `finish()`; absent if it could not run. */
  output?: string
  /** Error thrown by the script itself, or why the run was cut short. */
  error?: string
}

/**
 * Worker body (CommonJS, run with `eval: true` so the build needs no extra entry). It loads
 * QuickJS from the absolute paths in workerData and runs one job per message.
 */
const WORKER_SOURCE = String.raw`
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const core = require(workerData.corePath);
const variantModule = require(workerData.variantPath);
const variant = variantModule.default || variantModule;
let quickjsPromise = null;

function describe(dumped) {
  if (dumped && typeof dumped === 'object' && typeof dumped.message === 'string') {
    return typeof dumped.name === 'string' && dumped.name !== 'Error' && dumped.name !== 'AssertionError'
      ? dumped.name + ': ' + dumped.message
      : dumped.message;
  }
  return String(dumped);
}

function takeError(vm, handle) {
  try { return describe(vm.dump(handle)); } finally { handle.dispose(); }
}

function runJob(quickjs, job) {
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(job.memoryLimitBytes);
  runtime.setMaxStackSize(job.maxStackBytes);
  let deadline = Date.now() + job.timeoutMs;
  let timedOut = false;
  runtime.setInterruptHandler(() => {
    if (Date.now() <= deadline) return false;
    timedOut = true;
    return true;
  });
  const vm = runtime.newContext();
  try {
    const prelude = vm.evalCode(workerData.prelude, 'pm-sandbox.js');
    if (prelude.error) return { error: 'Script sandbox failed to start: ' + takeError(vm, prelude.error) };
    const inputHandle = vm.newString(job.input);
    const installed = vm.callFunction(prelude.value, vm.undefined, inputHandle);
    inputHandle.dispose();
    prelude.value.dispose();
    if (installed.error) return { error: 'Script sandbox failed to start: ' + takeError(vm, installed.error) };
    const finish = installed.value;
    try {
      let error;
      const ran = vm.evalCode('(function () {\n' + job.script + '\n})()', job.filename);
      if (ran.error) {
        error = takeError(vm, ran.error);
      } else {
        ran.value.dispose();
        // Let promise-returning pm.test callbacks settle.
        const jobs = runtime.executePendingJobs();
        if (jobs.error) error = takeError(vm, jobs.error);
      }
      if (timedOut) error = 'Script timed out after ' + job.timeoutMs + 'ms';
      else if (error && /out of memory/i.test(error)) error = 'Script exceeded the memory limit';

      deadline = Date.now() + job.finishTimeoutMs;
      const finished = vm.callFunction(finish, vm.undefined);
      if (finished.error) {
        const message = takeError(vm, finished.error);
        return { error: error || 'Could not read script results: ' + message };
      }
      const output = vm.typeof(finished.value) === 'string' ? vm.getString(finished.value) : undefined;
      finished.value.dispose();
      return { output: output, error: error };
    } finally {
      finish.dispose();
    }
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

parentPort.on('message', async (job) => {
  let outcome;
  try {
    if (!quickjsPromise) quickjsPromise = core.newQuickJSWASMModuleFromVariant(variant);
    outcome = runJob(await quickjsPromise, job);
  } catch (e) {
    outcome = { error: e && e.message ? String(e.message) : String(e) };
  }
  parentPort.postMessage({ id: job.id, output: outcome.output, error: outcome.error });
});
`

/** Packaged builds must load QuickJS (and its .wasm) from app.asar.unpacked, not the archive. */
function unpackedPath(path: string): string {
  return path.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
}

interface PendingJob {
  id: number
  timer: NodeJS.Timeout
  resolve: (outcome: SandboxRunOutcome) => void
}

class SandboxWorker {
  private worker: Worker | null = null
  private pending: PendingJob | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private nextId = 1

  run(options: SandboxRunOptions): Promise<SandboxRunOutcome> {
    // One script at a time per worker; the next one starts when this settles either way.
    const result = this.queue.then(() => this.runNow(options))
    this.queue = result.catch(() => undefined)
    return result
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const require = createRequire(__filename)
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        corePath: unpackedPath(require.resolve('quickjs-emscripten-core')),
        variantPath: unpackedPath(require.resolve('@jitl/quickjs-wasmfile-release-sync')),
        prelude: GUEST_PRELUDE
      },
      // QuickJS has its own memory cap; this bounds the worker's JS heap around it.
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true
    })
    worker.unref()
    worker.on('message', (message: { id: number; output?: string; error?: string }) => {
      const job = this.pending
      if (!job || job.id !== message.id) return
      this.settle({ output: message.output, error: message.error })
    })
    worker.on('error', (e) => this.discard(worker, `Script sandbox crashed: ${e.message}`))
    worker.on('exit', () => this.discard(worker, 'Script sandbox stopped unexpectedly'))
    this.worker = worker
    return worker
  }

  private runNow(options: SandboxRunOptions): Promise<SandboxRunOutcome> {
    const timeoutMs = options.timeoutMs ?? SCRIPT_TIMEOUT_MS
    return new Promise((resolve) => {
      const worker = this.ensureWorker()
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.discard(worker, `Script timed out after ${timeoutMs}ms`)
        void worker.terminate()
      }, timeoutMs + FINISH_TIMEOUT_MS + HARD_KILL_GRACE_MS)
      this.pending = { id, timer, resolve }
      worker.postMessage({
        id,
        input: options.input,
        script: options.script,
        filename: options.filename,
        timeoutMs,
        finishTimeoutMs: FINISH_TIMEOUT_MS,
        memoryLimitBytes: options.memoryLimitBytes ?? SCRIPT_MEMORY_LIMIT_BYTES,
        maxStackBytes: SCRIPT_MAX_STACK_BYTES
      })
    })
  }

  private settle(outcome: SandboxRunOutcome): void {
    const job = this.pending
    if (!job) return
    this.pending = null
    clearTimeout(job.timer)
    job.resolve(outcome)
  }

  /** Forget a dead (or about to be killed) worker and fail whatever it was running. */
  private discard(worker: Worker, error: string): void {
    if (this.worker !== worker) return
    this.worker = null
    this.settle({ error })
  }
}

const sandbox = new SandboxWorker()

export function runInSandbox(options: SandboxRunOptions): Promise<SandboxRunOutcome> {
  return sandbox.run(options)
}
