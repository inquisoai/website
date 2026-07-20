// Prebuild sync: transform the frontmatter-less markdown in the `inquiso`
// submodule (docs/) into Starlight-ready content under src/content/docs/docs/.
//
// - derives `title` from the first `# ` heading (and strips that line)
// - derives an optional `description` from a leading blockquote / first paragraph
// - injects YAML frontmatter
// - rewrites intra-repo links: in-tree doc links -> absolute site routes,
//   out-of-tree (or excluded) .md links -> GitHub blob URLs
//
// It is intentionally dependency-free (Node ESM only) and idempotent: the
// output directory is wiped and regenerated on every run.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPO = join(ROOT, "inquiso"); // git submodule
const DOCS_SRC = join(REPO, "docs");
const OUT = join(ROOT, "src", "content", "docs", "docs");
const GH_BLOB = "https://github.com/inquisoai/inquiso/blob/main";

// Basenames that are internal dev logs / audits — always excluded.
const EXCLUDE_FILES = new Set([
  "build-log.md",
  "implementation-plan.md",
  "current-architecture.md",
  "ai-sdk-integration-audit.md",
  "day-1-2-audit.md",
]);
// Subdirectories excluded wholesale.
const EXCLUDE_DIRS = new Set(["hackathon", "ai-sdk"]);

// Root docs sorted into the "guide" group; everything else at root -> "design".
const GUIDE_FILES = new Set(["00-vision.md", "09-roadmap.md", "10-user-guide.md", "demo-script.md"]);

if (!existsSync(DOCS_SRC)) {
  console.error(`[sync-docs] Missing ${DOCS_SRC}. Run: git submodule update --init`);
  process.exit(1);
}

// ---- collect included files (repo-relative posix paths under docs/) ----
/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      out.push(...walk(abs));
    } else if (name.endsWith(".md") && !EXCLUDE_FILES.has(name)) {
      out.push(abs);
    }
  }
  return out;
}

const files = walk(DOCS_SRC);

// Map repo-relative path (e.g. "docs/00-vision.md") -> site route (no .md).
/** @type {Map<string, string>} */
const routeByRepoPath = new Map();
/** @type {{abs: string, repoPath: string, destPath: string, route: string}[]} */
const plan = [];

for (const abs of files) {
  const repoPath = posix.normalize(relative(REPO, abs).split(/[\\/]/).join("/"));
  const relFromDocs = posix.normalize(relative(DOCS_SRC, abs).split(/[\\/]/).join("/"));
  // Reorganize the root numbered docs into guide/ and design/ subfolders.
  let destRel = relFromDocs;
  if (!relFromDocs.includes("/")) {
    destRel = (GUIDE_FILES.has(relFromDocs) ? "guide/" : "design/") + relFromDocs;
  }
  const route = "/docs/" + destRel.replace(/\.md$/, "");
  routeByRepoPath.set(repoPath, route);
  plan.push({ abs, repoPath, destPath: join(OUT, destRel), route });
}

// ---- link rewriting ----
/**
 * @param {string} target link target (may include #anchor)
 * @param {string} srcRepoDir posix dir of the source file, relative to repo root
 */
function rewriteLink(target, srcRepoDir) {
  if (!/\.md(#.*)?$/.test(target)) return null; // only touch .md links
  if (/^[a-z]+:/i.test(target) || target.startsWith("//")) return null; // absolute URL
  const hashIdx = target.indexOf("#");
  const path = hashIdx === -1 ? target : target.slice(0, hashIdx);
  const anchor = hashIdx === -1 ? "" : target.slice(hashIdx);
  const resolved = posix.normalize(posix.join(srcRepoDir, path));
  const route = routeByRepoPath.get(resolved);
  if (route) return route + anchor; // in-tree, included doc -> site route
  return `${GH_BLOB}/${resolved}${anchor}`; // out-of-tree or excluded -> GitHub
}

/** @param {string} body @param {string} srcRepoDir */
function rewriteLinks(body, srcRepoDir) {
  return body.replace(/\]\(([^)]+)\)/g, (whole, target) => {
    const next = rewriteLink(target.trim(), srcRepoDir);
    return next ? `](${next})` : whole;
  });
}

// ---- frontmatter derivation ----
/** @param {string} raw */
function parse(raw) {
  const lines = raw.split("\n");
  let title = "";
  let titleIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^#\s+(.+?)\s*$/.exec(lines[i]);
    if (m) {
      title = m[1].trim();
      titleIdx = i;
      break;
    }
  }
  const bodyLines = titleIdx === -1 ? lines : [...lines.slice(0, titleIdx), ...lines.slice(titleIdx + 1)];
  const body = bodyLines.join("\n").replace(/^\n+/, "");
  return { title, body };
}

/** @param {string} body */
function deriveDescription(body) {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return "";
  const collected = [];
  const isQuote = lines[i].trimStart().startsWith(">");
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (isQuote && !line.trimStart().startsWith(">")) break;
    if (!isQuote && (line.startsWith("#") || line.startsWith("|") || line.startsWith("```"))) break;
    collected.push(line.replace(/^\s*>\s?/, ""));
  }
  let text = collected.join(" ");
  // strip common inline markdown for a clean meta description
  text = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 160) text = text.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return text;
}

// ---- write ----
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const item of plan) {
  const raw = readFileSync(item.abs, "utf8");
  const { title, body } = parse(raw);
  const srcRepoDir = posix.dirname(item.repoPath);
  const rewritten = rewriteLinks(body, srcRepoDir);
  const desc = deriveDescription(rewritten);
  const fm = [
    "---",
    `title: ${JSON.stringify(title || "Untitled")}`,
    ...(desc ? [`description: ${JSON.stringify(desc)}`] : []),
    "---",
    "",
  ].join("\n");
  mkdirSync(dirname(item.destPath), { recursive: true });
  writeFileSync(item.destPath, fm + rewritten.replace(/\s*$/, "") + "\n", "utf8");
  count++;
}

// ---- docs landing / overview page (route /docs) ----
writeFileSync(
  join(OUT, "index.md"),
  `---
title: Documentation
description: The Inquiso documentation — vision, architecture, the transparent agent, the MemoryAgent system, ADRs, and deployment.
---

Everything you need to understand and build on **Inquiso** — the local-first, serverless AI
sidebar and transparent browser agent. These pages are synced from the
[canonical repository](${GH_BLOB.replace("/blob/main", "")}) so they always match the code.

## Guide

Product goals, the roadmap, the end-user guide, and the demo walkthrough. Start here if you
are not writing code:

- [Vision & Scope](/docs/guide/00-vision)
- [User Guide](/docs/guide/10-user-guide)
- [Roadmap](/docs/guide/09-roadmap)
- [Demo Script](/docs/guide/demo-script)

## Design

How the system is built — architecture, tech stack, providers & auth, the agent loop,
security, caching, project structure, and coding standards:

- [Architecture](/docs/design/01-architecture)
- [Tech Stack](/docs/design/02-tech-stack)
- [Providers & Auth](/docs/design/03-providers-and-auth)
- [Agent System](/docs/design/04-agent-system)
- [Security](/docs/design/05-security)

## Memory Agent

The system that lets Inquiso remember *how* tasks were done — locally and inspectably:

- [MemoryAgent Overview](/docs/memory-agent/overview)
- [Data Model](/docs/memory-agent/data-model)
- [Browser Skills](/docs/memory-agent/browser-skills)
- [Security](/docs/memory-agent/security)
- [Evaluation](/docs/memory-agent/evaluation)

## Architecture Decision Records

The "why" behind the big calls — see the [ADRs](/docs/adr/0001-auth-strategy-byok-plus-optin-oauth).

## Deployment

- [Alibaba Cloud (Qwen) deployment](/docs/deployment/alibaba-cloud)
`,
  "utf8",
);
count++;

console.log(`[sync-docs] wrote ${count} docs to ${relative(ROOT, OUT)}`);
