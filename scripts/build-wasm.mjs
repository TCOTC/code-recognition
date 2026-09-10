import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";

const executable = name => process.platform === "win32" ? `${name}.exe` : name;
const run = (command, args, cwd) => {
    const result = spawnSync(executable(command), args, {cwd, stdio: "inherit"});
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const root = process.cwd();
const crate = path.join(root, "wasm-detector");
run("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"], crate);
run("wasm-bindgen", [
    path.join(crate, "target", "wasm32-unknown-unknown", "release", "betlang_wasm.wasm"),
    "--target",
    "web",
    "--out-dir",
    path.join(root, "src", "wasm"),
    "--out-name",
    "betlang_wasm",
], root);
