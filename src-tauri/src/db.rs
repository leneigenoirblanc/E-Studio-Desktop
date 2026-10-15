use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn init_db(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            revision INTEGER NOT NULL,
            document_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS template_revisions (
            id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            document_json TEXT NOT NULL,
            saved_at TEXT NOT NULL,
            PRIMARY KEY(id, revision)
        );

        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            scan TEXT,
            partno TEXT,
            document_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_products_scan ON products(scan);
        CREATE INDEX IF NOT EXISTS idx_products_partno ON products(partno);

        CREATE TABLE IF NOT EXISTS import_batches (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            report_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS print_jobs (
            id TEXT PRIMARY KEY,
            job_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit (
            id TEXT PRIMARY KEY,
            at TEXT NOT NULL,
            os_user TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_id TEXT,
            details TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;

    Ok(conn)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertResult {
    pub inserted: usize,
    pub updated: usize,
    pub rejected: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditRecord {
    pub id: String,
    pub at: String,
    pub os_user: String,
    pub action: String,
    pub entity_id: Option<String>,
    pub details: String,
}
