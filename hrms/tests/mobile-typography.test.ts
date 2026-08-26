import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const workspaceShell = readFileSync(join(process.cwd(), "app/workspace-shell.tsx"), "utf8");

describe("mobile readability contract", () => {
  it("keeps readable body, controls, evidence, and navigation type on phones", () => {
    expect(css).toContain("/* Mobile readability: designed for users who may need larger type and touch targets. */");
    expect(css).toContain("body { font-size: 16px; line-height: 1.55; }");
    expect(css).toContain("button, input, select, textarea { font-size: 16px; }");
    expect(css).toContain(".attendance-list strong { font-size: 18px;");
    expect(css).toContain(".attendance-list small { font-size: 15px;");
    expect(css).toContain(".mobile-nav a, .mobile-nav button { min-height: 52px;");
  });

  it("keeps an explicit logout action in the mobile navigation", () => {
    expect(workspaceShell).toContain('<form action={logout}><button aria-label="登出"');
    expect(workspaceShell).toContain("<span>登出</span>");
    expect(css).not.toContain(".profile-mini svg { display: none; }");
  });
});
