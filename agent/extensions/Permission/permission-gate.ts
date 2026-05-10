// @name: 权限守卫
// @category: security
// @description: 在执行危险 bash 命令前弹出确认对话框

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { confirmOverlay } from "./confirm-overlay";

type Severity = "medium" | "high" | "critical";

type DangerousRule = {
  id: string;
  severity: Severity;
  pattern: RegExp;
  reason: string;
};

type MatchResult = DangerousRule & {
  matchedText?: string;
};

const DANGEROUS_RULES: DangerousRule[] = [
  {
    id: "rm-recursive-force",
    severity: "high",
    pattern: /\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\b/i,
    reason: "递归强制删除文件或目录",
  },
  {
    id: "rm-protected-path",
    severity: "critical",
    pattern:
      /\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+(?:\/|\/\*|~|~\/|\$HOME|\$\{HOME\}|\.|\.\.)\b/i,
    reason: "递归强制删除根目录、主目录、当前目录或上级目录",
  },
  {
    id: "rm-system-path",
    severity: "critical",
    pattern:
      /\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+(?:\/bin|\/boot|\/dev|\/etc|\/lib|\/lib64|\/proc|\/root|\/sbin|\/sys|\/usr|\/var)\b/i,
    reason: "递归强制删除系统关键目录",
  },
  {
    id: "sudo-command",
    severity: "medium",
    pattern: /(^|[\s|;&])sudo\s+/i,
    reason: "使用管理员权限执行命令",
  },
  {
    id: "sudo-rm",
    severity: "critical",
    pattern: /(^|[\s|;&])sudo\s+rm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\b/i,
    reason: "使用管理员权限递归强制删除",
  },
  {
    id: "disk-overwrite-dd",
    severity: "critical",
    pattern: /\bdd\s+.*\b(?:of=\/dev\/|if=\/dev\/zero|if=\/dev\/random|if=\/dev\/urandom)\S*/i,
    reason: "使用 dd 读写设备或随机数据，可能破坏磁盘数据",
  },
  {
    id: "filesystem-format",
    severity: "critical",
    pattern: /\b(?:mkfs|mkfs\.[a-z0-9]+|mkswap)\b/i,
    reason: "格式化文件系统或交换分区",
  },
  {
    id: "partition-change",
    severity: "critical",
    pattern: /\b(?:fdisk|parted|sfdisk|gdisk|sgdisk)\b/i,
    reason: "修改磁盘分区表",
  },
  {
    id: "write-device-file",
    severity: "critical",
    pattern: /(?:^|[\s|;&])(?:.+?>\s*\/dev\/\S+|tee\s+\/dev\/\S+)/i,
    reason: "向设备文件写入数据",
  },
  {
    id: "chmod-dangerous",
    severity: "high",
    pattern: /\bchmod\s+(?:-R\s+)?(?:777|ugo\+rwx|a\+rwx)\b/i,
    reason: "授予过宽文件权限",
  },
  {
    id: "chown-recursive",
    severity: "medium",
    pattern: /\bchown\s+(?:-R\s+|.*\s-R\s+).+/i,
    reason: "递归修改文件所有者",
  },
  {
    id: "curl-pipe-shell",
    severity: "high",
    pattern: /\b(?:curl|wget)\b.+\|\s*(?:sh|bash|zsh|fish)\b/i,
    reason: "下载脚本并立即交给 Shell 执行",
  },
  {
    id: "shell-remote-code",
    severity: "high",
    pattern: /\b(?:bash|sh|zsh|fish)\s+<\s*\(\s*(?:curl|wget)\b/i,
    reason: "通过进程替换执行远程脚本",
  },
  {
    id: "git-reset-hard",
    severity: "medium",
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: "丢弃 Git 工作区和暂存区变更",
  },
  {
    id: "git-clean-force",
    severity: "high",
    pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*\b/i,
    reason: "强制删除 Git 未跟踪文件",
  },
  {
    id: "git-push-force",
    severity: "high",
    pattern: /\bgit\s+push\b.*(?:--force|-f|--force-with-lease)\b/i,
    reason: "强制推送可能覆盖远端提交",
  },
  {
    id: "docker-prune-force",
    severity: "high",
    pattern: /\bdocker\s+(?:system|volume|image|container|builder)\s+prune\b.*(?:-f|--force)\b/i,
    reason: "强制清理 Docker 资源",
  },
  {
    id: "docker-remove-force",
    severity: "medium",
    pattern: /\bdocker\s+(?:rm|rmi|volume\s+rm)\b.*(?:-f|--force)\b/i,
    reason: "强制删除 Docker 容器、镜像或卷",
  },
  {
    id: "kubernetes-delete",
    severity: "high",
    pattern: /\bkubectl\s+delete\b.*(?:--all|-A|--all-namespaces|namespace|ns|deployment|pod|service|secret|configmap|pvc|pv)\b/i,
    reason: "删除 Kubernetes 资源",
  },
  {
    id: "process-kill-broad",
    severity: "medium",
    pattern: /\b(?:killall|pkill)\b\s+(?:-9\s+)?(?:node|python|java|docker|containerd|sshd|nginx|mysql|postgres|redis)\b/i,
    reason: "批量终止关键进程",
  },
  {
    id: "systemctl-critical",
    severity: "medium",
    pattern: /\bsystemctl\s+(?:stop|disable|mask|restart)\s+(?:sshd|ssh|docker|network|networking|firewalld|ufw|nginx|mysql|postgres|redis)\b/i,
    reason: "停止、禁用或重启关键系统服务",
  },
  {
    id: "sensitive-env-file",
    severity: "high",
    pattern: /(^|[\s|;&<>])(?:\S*[/\\])?\.env(?:\.[^\s|;&<>]*)?(?=$|[\s|;&<>])/i,
    reason: "通过 Bash 访问 .env 类环境变量文件，可能泄露或修改密钥",
  },
  {
    id: "sensitive-secret-file",
    severity: "high",
    pattern: /(^|[\s|;&<>])\S*(?:secret|secrets|credential|credentials|creds|token|tokens|private[-_]?key|api[-_]?key|access[-_]?key)\S*(?=$|[\s|;&<>])/i,
    reason: "通过 Bash 访问文件名包含 secret/token/credential/key 的敏感文件",
  },
  {
    id: "sensitive-ssh-private-key",
    severity: "critical",
    pattern: /(^|[\s|;&<>])(?:\S*[/\\])?(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?=$|[\s|;&<>])/i,
    reason: "通过 Bash 访问 SSH 私钥文件",
  },
  {
    id: "sensitive-auth-config-file",
    severity: "high",
    pattern: /(^|[\s|;&<>])(?:\S*[/\\])?(?:\.npmrc|\.pypirc|\.netrc|credentials)(?=$|[\s|;&<>])/i,
    reason: "通过 Bash 访问常见包管理器、云服务或网络认证文件",
  },
  {
    id: "shell-rc-file",
    severity: "medium",
    pattern: /(^|[\s|;&<>])(?:\S*[/\\])?(?:\.bashrc|\.zshrc)(?=$|[\s|;&<>])/i,
    reason: "通过 Bash 访问 Shell 启动配置文件，可能包含环境变量、密钥或影响终端启动行为",
  },
  {
    id: "shutdown-reboot",
    severity: "medium",
    pattern: /\b(?:shutdown|reboot|halt|poweroff)\b/i,
    reason: "关闭或重启系统",
  },
];

function normalizeCommand(command: string): string {
  return command
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuotedStrings(command: string): string {
  return command
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""');
}

function removeQuoteDelimiters(command: string): string {
  return command.replace(/["']/g, "");
}

function removeSafeStderrDevNullRedirects(command: string): string {
  return command.replace(/(^|[\s|;&])2\s*>{1,2}\s*\/dev\/null\b/g, "$1");
}

function detectDangerousCommand(command: string): MatchResult[] {
  const normalized = removeSafeStderrDevNullRedirects(normalizeCommand(command));
  const commandWithoutQuotedStrings = stripQuotedStrings(normalized);
  const commandWithoutQuoteDelimiters = removeQuoteDelimiters(normalized);

  const matches: MatchResult[] = [];

  for (const rule of DANGEROUS_RULES) {
    const match =
      normalized.match(rule.pattern) ??
      commandWithoutQuotedStrings.match(rule.pattern) ??
      commandWithoutQuoteDelimiters.match(rule.pattern);

    if (match) {
      matches.push({
        ...rule,
        matchedText: match[0],
      });
    }
  }

  return matches.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function severityWeight(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
  }
}

function formatMatches(matches: MatchResult[]): string {
  return matches
    .map((match) => `[${match.severity}] ${match.id}\n原因: ${match.reason}`)
    .join("\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const matches = detectDangerousCommand(command);

    if (matches.length === 0) return;

    const pauseReason = `permission-gate:${event.toolCallId}`;
    pi.events.emit("status-line:timer-pause", pauseReason);
    let ok = false;
    try {
      ok = await confirmOverlay(
        ctx,
        "危险命令检测",
        [
          "高危 Bash 操作:",
          formatMatches(matches),
          "",
          "完整命令:",
          command,
          "",
          "是否执行?",
        ].join("\n")
      );
    } finally {
      pi.events.emit("status-line:timer-resume", pauseReason);
    }

    if (!ok) {
      return {
        block: true,
        reason: `危险命令被用户拒绝: ${matches.map((match) => match.id).join(", ")}`,
      };
    }
  });
}