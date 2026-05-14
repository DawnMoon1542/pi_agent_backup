import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { logToolDisplayDebug } from "./debug-logger.js";
import { isMcpToolCandidate } from "./tool-metadata.js";
import type { ToolDisplayConfig } from "./types.js";

export interface ToolDisplayCapabilities {
	hasMcpTooling: boolean;
	hasRtkOptimizer: boolean;
}

function hasMcpTooling(pi: ExtensionAPI): boolean {
	try {
		const allTools = pi.getAllTools();
		return allTools.some((tool) => isMcpToolCandidate(tool));
	} catch (error) {
		logToolDisplayDebug("MCP capability detection failed.", error);
		return false;
	}
}

function hasRtkCommand(pi: ExtensionAPI): boolean {
	try {
		const commands = pi.getCommands();
		return commands.some((command) => command.name === "rtk" || command.name.startsWith("rtk-"));
	} catch (error) {
		logToolDisplayDebug("RTK command capability detection failed.", error);
		return false;
	}
}

function hasRtkExtensionPath(cwd: string): boolean {
	const candidates = [join(getAgentDir(), "extensions", "pi-rtk-optimizer"), join(cwd, ".pi", "extensions", "pi-rtk-optimizer")];

	for (const candidate of candidates) {
		try {
			if (existsSync(candidate)) {
				return true;
			}
		} catch (error) {
			logToolDisplayDebug(`RTK capability path probe failed for ${candidate}.`, error);
			// Ignore filesystem errors and continue probing other candidates.
		}
	}

	return false;
}

export function detectToolDisplayCapabilities(pi: ExtensionAPI, cwd: string): ToolDisplayCapabilities {
	return {
		hasMcpTooling: hasMcpTooling(pi),
		hasRtkOptimizer: hasRtkCommand(pi) || hasRtkExtensionPath(cwd),
	};
}

export function applyCapabilityConfigGuards(
	config: ToolDisplayConfig,
	capabilities: ToolDisplayCapabilities,
): ToolDisplayConfig {
	return {
		...config,
		registerToolOverrides: { ...config.registerToolOverrides },
		mcpOutputMode: capabilities.hasMcpTooling ? config.mcpOutputMode : "hidden",
		showRtkCompactionHints: capabilities.hasRtkOptimizer ? config.showRtkCompactionHints : false,
	};
}
