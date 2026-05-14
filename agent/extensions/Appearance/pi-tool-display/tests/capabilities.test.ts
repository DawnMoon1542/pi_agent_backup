import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	applyCapabilityConfigGuards,
	detectToolDisplayCapabilities,
} from "../src/capabilities.ts";
import { DEFAULT_TOOL_DISPLAY_CONFIG } from "../src/types.ts";

function createExtensionApiStub(allTools: unknown[]): ExtensionAPI {
	return {
		getAllTools(): unknown[] {
			return allTools;
		},
		getCommands(): Array<{ name: string }> {
			return [];
		},
	} as unknown as ExtensionAPI;
}

test("detectToolDisplayCapabilities recognises MCP tools from v0.62.0 tool info without label or execute", () => {
	const api = createExtensionApiStub([
		{
			name: "exa_web_search_exa",
			description:
				"Search the web with Exa. Direct MCP wrapper for 'exa:web_search_exa'. Common args: query*.",
			parameters: {},
			sourceInfo: {
				path: "C:/Users/Administrator/.pi/agent/extensions/pi-mcp-adapter/index.ts",
				source: "local",
				scope: "user",
				origin: "top-level",
			},
		},
	]);

	const capabilities = detectToolDisplayCapabilities(api, "C:/Users/Administrator/.pi");

	assert.equal(capabilities.hasMcpTooling, true);
});

test("applyCapabilityConfigGuards hides MCP output when no MCP tooling is available", () => {
	const guarded = applyCapabilityConfigGuards(DEFAULT_TOOL_DISPLAY_CONFIG, {
		hasMcpTooling: false,
		hasRtkOptimizer: true,
	});

	assert.equal(guarded.mcpOutputMode, "hidden");
	assert.equal(guarded.showRtkCompactionHints, DEFAULT_TOOL_DISPLAY_CONFIG.showRtkCompactionHints);
});
