// @name: 敏感文件审批
// @category: security
// @description: 读写 .env、secret、token、key 等敏感文件名前要求确认

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

type Operation = "read" | "write" | "edit";

type SensitiveRule = {
  id: string;
  pattern: RegExp;
  reason: string;
};

type SensitiveMatch = SensitiveRule & {
  matchedText: string;
};

const SENSITIVE_RULES: SensitiveRule[] = [
  {
    id: "env-file",
    pattern: /(^|[/\\])\.env(?:\.|$|[/\\])|\.env\b/i,
    reason: "环境变量文件通常包含 API Key、Token、数据库密码等密钥",
  },
  {
    id: "secret-file",
    pattern: /(^|[/\\])[^/\\]*(?:secret|secrets)[^/\\]*$/i,
    reason: "文件名包含 secret/secrets",
  },
  {
    id: "credential-file",
    pattern: /(^|[/\\])[^/\\]*(?:credential|credentials|creds)[^/\\]*$/i,
    reason: "文件名包含 credential/credentials/creds",
  },
  {
    id: "token-file",
    pattern: /(^|[/\\])[^/\\]*(?:token|tokens)[^/\\]*$/i,
    reason: "文件名包含 token/tokens",
  },
  {
    id: "key-file",
    pattern: /(^|[/\\])[^/\\]*(?:private[-_]?key|api[-_]?key|access[-_]?key)[^/\\]*$/i,
    reason: "文件名包含 private key / api key / access key",
  },
  {
    id: "ssh-private-key",
    pattern: /(^|[/\\])(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:$|[/\\])/i,
    reason: "SSH 私钥文件",
  },
  {
    id: "cloud-or-package-credentials",
    pattern: /(^|[/\\])(?:\.npmrc|\.pypirc|\.netrc|credentials)(?:$|[/\\])/i,
    reason: "常见包管理器、云服务或网络认证文件",
  },
  {
    id: "shell-rc-file",
    pattern: /(^|[/\\])(?:\.bashrc|\.zshrc)(?:$|[/\\])/i,
    reason: "Shell 启动配置文件，可能包含环境变量、密钥或影响终端启动行为",
  },
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function detectSensitivePath(path: string): SensitiveMatch[] {
  const normalized = normalizePath(path);
  const matches: SensitiveMatch[] = [];

  for (const rule of SENSITIVE_RULES) {
    const match = normalized.match(rule.pattern);
    if (match) {
      matches.push({
        ...rule,
        matchedText: match[0],
      });
    }
  }

  return matches;
}

function formatMatches(matches: SensitiveMatch[]): string {
  return matches
    .map((match) => [
      `规则: ${match.id}`,
      `原因: ${match.reason}`,
      `匹配片段: ${match.matchedText}`,
    ].join("\n"))
    .join("\n\n");
}

async function confirmSensitiveFile(ctx: any, operation: Operation, path: string, matches: SensitiveMatch[]) {
  const opText: Record<Operation, string> = {
    read: "读取",
    write: "写入",
    edit: "编辑",
  };

  return ctx.ui.confirm(
    "敏感文件访问确认",
    [
      `检测到 ${opText[operation]} 敏感文件:`,
      path,
      "",
      formatMatches(matches),
      "",
      `是否允许本次${opText[operation]}?`,
    ].join("\n")
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    let operation: Operation | undefined;
    let path: string | undefined;

    if (isToolCallEventType("read", event)) {
      operation = "read";
      path = event.input.path;
    } else if (isToolCallEventType("write", event)) {
      operation = "write";
      path = event.input.path;
    } else if (isToolCallEventType("edit", event)) {
      operation = "edit";
      path = event.input.path;
    }

    if (!operation || !path) return;

    const matches = detectSensitivePath(path);
    if (matches.length === 0) return;

    const ok = await confirmSensitiveFile(ctx, operation, path, matches);
    if (!ok) {
      return {
        block: true,
        reason: `敏感文件访问被用户拒绝: ${operation} ${path} (${matches.map((m) => m.id).join(", ")})`,
      };
    }
  });
}
