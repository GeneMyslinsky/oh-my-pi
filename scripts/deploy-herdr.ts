#!/usr/bin/env bun

/**
 * Build the compiled omp binary and deploy it into the herdr wrapper dir.
 *
 * Herdr panes resolve `omp` via ~/.omp/herdr/bin/omp — a wrapper script that
 * execs its `omp.real` symlink sibling. This script:
 *
 *   1. builds natives + the compiled binary (packages/coding-agent/dist/omp),
 *   2. installs it under the stable name `omp.patched` (previous deploy is
 *      kept as `omp.patched.prev`),
 *   3. smoke-tests the installed binary (`--version`, then `--smoke-test`),
 *   4. atomically retargets `omp.real` -> `omp.patched`.
 *
 * The symlink is only retargeted after the smoke test passes, so a broken
 * build never becomes the active herdr binary. Rollback: point `omp.real`
 * back at the upstream binary kept in the same directory, e.g.
 * `ln -sfn omp.upstream-<version> ~/.omp/herdr/bin/omp.real`.
 *
 * Flags: --skip-build (deploy the existing dist/omp), --skip-smoke.
 * Env: OMP_HERDR_BIN_DIR overrides the target directory.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { $which, isEnoent } from "@oh-my-pi/pi-utils";

const repoRoot = path.join(import.meta.dir, "..");
const packageDir = path.join(repoRoot, "packages", "coding-agent");
const distBinary = path.join(packageDir, "dist", "omp");

const binDir = Bun.env.OMP_HERDR_BIN_DIR ?? path.join(os.homedir(), ".omp", "herdr", "bin");
const installedName = "omp.patched";
const installedPath = path.join(binDir, installedName);
const previousPath = `${installedPath}.prev`;
const realLink = path.join(binDir, "omp.real");
const wrapperPath = path.join(binDir, "omp");

const args = new Set(Bun.argv.slice(2));
const skipBuild = args.delete("--skip-build");
const skipSmoke = args.delete("--skip-smoke");
if (args.size > 0) {
	console.error(`Unknown arguments: ${[...args].join(" ")}`);
	console.error("Usage: bun scripts/deploy-herdr.ts [--skip-build] [--skip-smoke]");
	process.exit(2);
}

async function run(command: string[], cwd: string): Promise<void> {
	const result = await $`${command}`.cwd(cwd).nothrow();
	if (result.exitCode !== 0) {
		console.error(`Command failed (${result.exitCode}): ${command.join(" ")}`);
		process.exit(1);
	}
}

async function main(): Promise<void> {
	// Sanity: only deploy into a directory that actually holds the herdr
	// wrapper; anything else means the target is misconfigured and a 140MB
	// binary would land somewhere useless.
	try {
		await fs.access(wrapperPath, fs.constants.X_OK);
	} catch {
		console.error(`No executable herdr wrapper at ${wrapperPath}; refusing to deploy.`);
		console.error("Set OMP_HERDR_BIN_DIR if the herdr bin directory lives elsewhere.");
		process.exit(1);
	}

	if (!skipBuild) {
		// Natives need bazel; the compiled-binary build only *embeds* the
		// prebuilt .node from packages/natives/native. Rebuild when the
		// toolchain is available, otherwise reuse the existing artifact —
		// gen:native fails loudly if none exists.
		if ($which("bazelisk") || $which("bazel")) {
			console.log("Building natives...");
			await run(["bun", "run", "build:native"], repoRoot);
		} else {
			console.log("bazel not on PATH; embedding existing native artifacts.");
		}
		console.log("Building compiled binary...");
		await run(["bun", "run", "build"], packageDir);
	}

	try {
		await fs.access(distBinary, fs.constants.X_OK);
	} catch {
		console.error(`No executable binary at ${distBinary}. Run without --skip-build first.`);
		process.exit(1);
	}

	// Install via copy + rename: the previous binary may be executing in live
	// herdr panes, so never write it in place (ETXTBSY); the old inode stays
	// valid for running processes after the rename.
	const stagingPath = `${installedPath}.tmp-${process.pid}`;
	await fs.copyFile(distBinary, stagingPath);
	await fs.chmod(stagingPath, 0o755);
	try {
		await fs.rename(installedPath, previousPath);
	} catch (err) {
		if (!isEnoent(err)) throw err;
	}
	await fs.rename(stagingPath, installedPath);

	const version = (await $`${installedPath} --version`.nothrow().quiet()).text().trim();
	if (!version) {
		console.error(`Installed binary failed to report a version: ${installedPath}`);
		process.exit(1);
	}
	console.log(`Installed ${installedName} (${version})`);

	if (!skipSmoke) {
		console.log("Running smoke test...");
		const smoke = await $`${installedPath} --smoke-test`.nothrow();
		if (smoke.exitCode !== 0) {
			console.error(`Smoke test failed (${smoke.exitCode}); omp.real was NOT retargeted.`);
			console.error(`Inspect ${installedPath}, or rollback the install: mv ${previousPath} ${installedPath}`);
			process.exit(1);
		}
	}

	// Atomic retarget: build the new symlink beside the live one, then rename
	// over it so `omp.real` never dangles for wrapper invocations in flight.
	const previousTarget = await fs.readlink(realLink).catch(() => "<none>");
	const linkStaging = `${realLink}.tmp-${process.pid}`;
	await fs.rm(linkStaging, { force: true });
	await fs.symlink(installedName, linkStaging);
	await fs.rename(linkStaging, realLink);

	console.log(`omp.real: ${previousTarget} -> ${installedName}`);
	console.log(`Herdr panes now launch ${installedPath} (${version}).`);
	console.log(`Rollback: ln -sfn ${previousTarget} ${realLink}`);
}

await main();
