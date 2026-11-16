import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JourneyReport, JourneySummaryRow } from "@/types/analysis";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "semantic-journey.db");

type ReportRow = {
  id: string;
  url: string;
  goal: string;
  mode: string;
  status: string;
  started_at: string;
  duration_ms: number;
  step_count: number;
  semantic_findings: number;
  axe_findings: number;
  requires_manual_review: number;
  report_json: string;
};

type GlobalDb = { __semanticJourneyDb?: DatabaseSync };
const globalForDb = globalThis as GlobalDb;

function database(): DatabaseSync {
  if (!globalForDb.__semanticJourneyDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        goal TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        step_count INTEGER NOT NULL,
        semantic_findings INTEGER NOT NULL,
        axe_findings INTEGER NOT NULL,
        requires_manual_review INTEGER NOT NULL,
        report_json TEXT NOT NULL
      )
    `);
    globalForDb.__semanticJourneyDb = db;
  }
  return globalForDb.__semanticJourneyDb;
}

export function saveReport(report: JourneyReport): void {
  const db = database();
  db.prepare(
    `INSERT OR REPLACE INTO reports (
      id, url, goal, mode, status, started_at, duration_ms, step_count,
      semantic_findings, axe_findings, requires_manual_review, report_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    report.id,
    report.target.url,
    report.target.goal,
    report.target.mode,
    report.status,
    report.startedAt,
    report.durationMs,
    report.steps.length,
    report.semanticFindings.length,
    report.axeFindings.length,
    report.requiresManualReview ? 1 : 0,
    JSON.stringify(report),
  );
}

export function getReport(id: string): JourneyReport | undefined {
  const row = database().prepare("SELECT report_json FROM reports WHERE id = ?").get(id) as
    | { report_json: string }
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.report_json) as JourneyReport;
  } catch {
    return undefined;
  }
}

export function listReports(limit = 12): JourneySummaryRow[] {
  const rows = database()
    .prepare(
      `SELECT id, url, goal, mode, status, started_at, duration_ms, step_count,
              semantic_findings, axe_findings, requires_manual_review
       FROM reports ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit) as Omit<ReportRow, "report_json">[];

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    goal: row.goal,
    mode: row.mode as JourneySummaryRow["mode"],
    status: row.status as JourneySummaryRow["status"],
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    stepCount: row.step_count,
    semanticFindingCount: row.semantic_findings,
    axeFindingCount: row.axe_findings,
    requiresManualReview: row.requires_manual_review === 1,
  }));
}
