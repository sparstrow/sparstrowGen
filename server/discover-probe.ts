import { getProvider } from "./src/providers/index.js";
const p = getProvider("antigravity") as any;
const result = await p.discoverModels();
console.log("live:", result.live);
console.log("detail:", result.detail);
console.log("count:", result.models.length);
console.log(JSON.stringify(result.models, null, 2));
