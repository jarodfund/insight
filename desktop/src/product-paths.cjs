const fs = require("node:fs");
const path = require("node:path");
const { portablePlatform } = require("./portable-platform.cjs");

const developmentRoot = path.resolve(__dirname, "../..");
const distributionRoot = process.env.INSIGHT_PRODUCT_ROOT || (process.resourcesPath && path.join(process.resourcesPath, "product"));
const productRoot = distributionRoot && fs.existsSync(path.join(distributionRoot, "runtime")) ? distributionRoot : developmentRoot;
const packagedRuntime = path.join(productRoot, "runtime");
const runtimeDirectory = fs.existsSync(packagedRuntime) ? packagedRuntime : path.join(productRoot, ".pi-install");
const cli = path.join(runtimeDirectory, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const distributed = fs.existsSync(packagedRuntime);
const node = distributed ? path.join(productRoot, portablePlatform().node) : process.platform === "win32" ? path.join(productRoot, ".tools/node-v22.23.2-win-x64/node.exe") : process.env.PI_NODE || "node";

module.exports = { productRoot, runtimeDirectory, cli, node, distributed };
