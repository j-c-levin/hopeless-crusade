import { simulate } from './simulate';

// This project has no @types/node; declare just enough of the node global to read argv
// (the file is only ever run under Node via vite-node, per the "sim" npm script).
declare const process: { argv: string[] };

const [runs = '100', seed = '1'] = process.argv.slice(2);
const stats = simulate(Number(runs), Number(seed));
console.log(JSON.stringify(stats, null, 2));
