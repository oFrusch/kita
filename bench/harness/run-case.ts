import { REGISTRY } from "../cases/index";

const [, , caseName, iterationsArg] = process.argv;
const iterations = Number(iterationsArg);

const mod = REGISTRY[caseName];
if (!mod) {
  console.error(`unknown bench case: ${caseName}`);
  process.exit(2);
}

const warmup = mod.warmup ?? 3000;
const state = mod.setup() as never;
const body = mod.body;

let sink = 0;

if (mod.isAsync) {
  for (let i = 0; i < warmup; i++) sink += (await body(state) as number) | 0;
  for (let i = 0; i < iterations; i++) sink += (await body(state) as number) | 0;
} else {
  for (let i = 0; i < warmup; i++) sink += (body(state) as number) | 0;
  for (let i = 0; i < iterations; i++) sink += (body(state) as number) | 0;
}

// Observe the sink so V8 cannot dead-code-eliminate the measured loop.
if (sink === Math.PI) console.log(sink);
