/**
 * Structural tests for the Korean hand-off document.
 *
 * The document is the user's deliverable, so the things that make it useful are
 * asserted rather than eyeballed: twelve sections, no empty body, Korean text,
 * every section stating its cost and a "완료 확인 방법", the concrete commands the
 * user must run, and an environment-variable table that matches `.env.example`
 * exactly. The last test packs a real document so a broken renderer cannot ship.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Packer } from "docx";

import {
  buildDocument,
  buildSections,
  ENV_TABLE,
  OUTPUT_PATH,
  type GuideBlock,
  type GuideSection,
} from "./generate-setup-guide";

const HANGUL = /[가-힣]/;
const sections = buildSections();

function blockText(block: GuideBlock): string {
  switch (block.kind) {
    case "text":
      return block.text;
    case "steps":
    case "bullets":
      return block.items.join("\n");
    case "code":
      return block.lines.join("\n");
    case "table":
      return [
        block.caption ?? "",
        block.headers.join(" "),
        ...block.rows.map((row) => row.join(" ")),
      ].join("\n");
  }
}

function sectionText(section: GuideSection): string {
  return [
    section.title,
    section.summary,
    section.cost,
    ...section.blocks.map((block) => blockText(block)),
    ...section.verification,
  ].join("\n");
}

describe("buildSections", () => {
  it("returns exactly the twelve required sections, numbered in order", () => {
    expect(sections).toHaveLength(12);
    expect(sections.map((section) => section.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it.each(sections.map((section) => [section.number, section.title, section] as const))(
    "section %i (%s) has a Korean title, summary, cost, body and verification",
    (_number, _title, section) => {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(HANGUL.test(section.title)).toBe(true);
      expect(section.summary.trim().length).toBeGreaterThan(20);
      expect(HANGUL.test(section.summary)).toBe(true);
      expect(section.cost.trim().length).toBeGreaterThan(0);
      expect(HANGUL.test(section.cost)).toBe(true);
      expect(section.blocks.length).toBeGreaterThan(0);
      expect(section.verification.length).toBeGreaterThan(0);
      for (const item of section.verification) {
        expect(item.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it("has no empty block anywhere", () => {
    const empty: string[] = [];
    for (const section of sections) {
      for (const [index, block] of section.blocks.entries()) {
        const label = `${section.number}.${index} (${block.kind})`;
        if (blockText(block).trim().length === 0) empty.push(label);
        if (block.kind === "steps" && block.items.length === 0) empty.push(label);
        if (block.kind === "bullets" && block.items.length === 0) empty.push(label);
        if (block.kind === "code" && block.lines.length === 0) empty.push(label);
        if (block.kind === "table" && block.rows.length === 0) empty.push(label);
      }
    }
    expect(empty).toEqual([]);
  });

  it("gives every section at least one numbered step or table", () => {
    const withoutProcedure = sections
      .filter(
        (section) =>
          section.blocks.some((block) => block.kind === "steps" || block.kind === "table") ===
          false,
      )
      .map((section) => section.number);
    expect(withoutProcedure).toEqual([]);
  });

  it("keeps every table rectangular", () => {
    for (const section of sections) {
      for (const block of section.blocks) {
        if (block.kind !== "table") continue;
        for (const row of block.rows) {
          expect(row).toHaveLength(block.headers.length);
        }
      }
    }
  });

  it("writes the whole document in Korean, with commands and URLs left verbatim", () => {
    for (const section of sections) {
      // Every prose element is Korean; `code` blocks are commands by design.
      for (const block of section.blocks) {
        if (block.kind === "code" || block.kind === "table") continue;
        expect(HANGUL.test(blockText(block))).toBe(true);
      }
    }
  });
});

describe("required content", () => {
  const byNumber = new Map(sections.map((section) => [section.number, section]));

  it("tells the user to run the migration and the seed first (section 3)", () => {
    const text = sectionText(byNumber.get(3)!);
    expect(text).toContain("npx prisma migrate deploy");
    expect(text).toContain("npm run db:seed");
    expect(text).toContain("pgvector");
    expect(text).toContain("DIRECT_URL");
  });

  it("covers local setup with the verification commands (section 1)", () => {
    const text = sectionText(byNumber.get(1)!);
    for (const command of ["npm ci", "npm run dev", "npm test", "npm run build"]) {
      expect(text).toContain(command);
    }
  });

  it("covers Supabase auth, OAuth redirect URLs and storage buckets (section 2)", () => {
    const text = sectionText(byNumber.get(2)!);
    expect(text).toContain("/auth/v1/callback");
    expect(text).toContain("/auth/callback");
    expect(text).toContain("Google");
    expect(text).toContain("Microsoft");
    expect(text).toContain("Storage");
  });

  it("covers the OpenAI key, model choice and usage limits (section 4)", () => {
    const text = sectionText(byNumber.get(4)!);
    expect(text).toContain("platform.openai.com/api-keys");
    expect(text).toContain("OPENAI_MODEL");
    expect(text).toContain("hard");
  });

  it("gives the key-generation command for field encryption (section 5)", () => {
    const text = sectionText(byNumber.get(5)!);
    expect(text).toContain("randomBytes(32)");
    expect(text).toContain("FIELD_ENCRYPTION_KEY");
  });

  it("covers the Mapbox token and Redis (sections 6 and 7)", () => {
    expect(sectionText(byNumber.get(6)!)).toContain("MAPBOX_ACCESS_TOKEN");
    const redis = sectionText(byNumber.get(7)!);
    expect(redis).toContain("REDIS_URL");
    expect(redis).toContain("API_RATE_LIMIT_PER_MINUTE");
  });

  it("covers both deployment paths plus domain, DNS and SSL (section 8)", () => {
    const text = sectionText(byNumber.get(8)!);
    expect(text).toContain("vercel.com/new");
    expect(text).toContain("docker build");
    expect(text).toContain("certbot");
    expect(text).toContain("/api/v1/health");
  });

  it("names every commercial factor library and where to buy it (section 9)", () => {
    const text = sectionText(byNumber.get(9)!);
    for (const dataset of ["ecoinvent", "DEFRA", "IEA", "eGRID", "Sphera", "IPCC"]) {
      expect(text).toContain(dataset);
    }
  });

  it("covers verification, SBTi, CDP, CSRD, ISSB and K-ETS (section 10)", () => {
    const text = sectionText(byNumber.get(10)!);
    for (const topic of ["ISO 14064-3", "SBTi", "CDP", "CSRD", "ISSB", "배출권거래제"]) {
      expect(text).toContain(topic);
    }
  });

  it("covers backup, monitoring, audit-log retention and access policy (section 11)", () => {
    const text = sectionText(byNumber.get(11)!);
    for (const topic of ["pg_dump", "/api/v1/health", "AuditTrail", "MFA"]) {
      expect(text).toContain(topic);
    }
  });

  it("lists the unimplemented work as a three-column table (section 12)", () => {
    const section = byNumber.get(12)!;
    const tables = section.blocks.filter((block) => block.kind === "table");
    expect(tables).toHaveLength(1);
    const table = tables[0] as Extract<GuideBlock, { kind: "table" }>;
    expect(table.headers).toEqual(["기능", "현재 상태", "사용자가 해야 할 일"]);
    expect(table.rows.length).toBeGreaterThanOrEqual(10);

    const text = sectionText(section);
    for (const topic of [
      "importActivityDataAction",
      "ResendNotificationChannel",
      "i18n",
      "rateLimit",
      "pgvector",
      "misstatement",
    ]) {
      expect(text).toContain(topic);
    }
  });
});

describe("ENV_TABLE", () => {
  const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  const documentedKeys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (match) => match[1],
  );

  it("documents exactly the keys .env.example declares, in the same order", () => {
    expect(ENV_TABLE.map((entry) => entry.name)).toEqual(documentedKeys);
  });

  it("explains the consequence of leaving each variable unset, in Korean", () => {
    for (const entry of ENV_TABLE) {
      expect(entry.effect.trim().length).toBeGreaterThan(10);
      expect(HANGUL.test(entry.effect)).toBe(true);
    }
  });

  it("marks the database and Supabase variables as required", () => {
    const required = ENV_TABLE.filter((entry) => entry.requirement === "필수").map(
      (entry) => entry.name,
    );
    expect(required).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });
});

describe("buildDocument", () => {
  it("packs a real OOXML file larger than 10 KB", async () => {
    const buffer = await Packer.toBuffer(buildDocument(sections));
    // "PK" — a renamed markdown file cannot pass this.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(10 * 1024);
  });

  it("writes to the path the in-app notices link to", () => {
    expect(OUTPUT_PATH).toBe("docs/CIOS-직접-설정-가이드.docx");
  });
});
