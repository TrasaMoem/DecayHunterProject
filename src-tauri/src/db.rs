use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("{0}")]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Custom(String),
}

pub struct AppState {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldRow {
    pub id: i64,
    pub name: String,
    pub owner_name: String,
    pub add_reason: String,
    pub is_favorite: bool,
    pub status: String,
    pub primary_lock: String,
    pub score: i64,
    pub decay_prob: i64,
    pub loot_prob: i64,
    pub priority_tier: String,
    pub last_checked_at: Option<String>,
    pub next_check_at: Option<String>,
    pub next_check_manual: bool,
    pub tags: Vec<String>,
    pub world_lock_decayed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationRecord {
    pub id: i64,
    pub checked_at: String,
    pub note: String,
    pub score: i64,
    pub decay_prob: i64,
    pub loot_prob: i64,
    pub auto_summary: String,
    pub next_check_at: Option<String>,
    pub traits: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDetail {
    pub world: WorldRow,
    pub observations: Vec<ObservationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationInput {
    pub id: Option<i64>,
    pub name: String,
    pub owner_name: String,
    pub add_reason: String,
    pub is_favorite: bool,
    pub status: String,
    pub primary_lock: String,
    pub tags: Vec<String>,
    pub note: String,
    pub score: i64,
    pub decay_prob: i64,
    pub loot_prob: i64,
    pub auto_summary: String,
    pub next_check_at: Option<String>,
    pub next_check_manual: bool,
    pub traits: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    pub total_worlds: i64,
    pub checked_today: i64,
    pub average_score: f64,
    pub top_world_name: Option<String>,
    pub top_world_score: i64,
    pub small_lock_decay_count: i64,
    pub worlds_with_pets: i64,
    pub world_lock_decay_count: i64,
    pub due_today_count: i64,
    pub overdue_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportBundle {
    pub version: u32,
    pub exported_at: String,
    pub data: serde_json::Value,
}

impl AppState {
    pub fn new(path: PathBuf) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS owners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS worlds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
                add_reason TEXT NOT NULL DEFAULT '',
                is_favorite INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'watching',
                primary_lock TEXT NOT NULL DEFAULT 'small',
                score INTEGER NOT NULL DEFAULT 0,
                decay_prob INTEGER NOT NULL DEFAULT 0,
                loot_prob INTEGER NOT NULL DEFAULT 0,
                priority_tier TEXT NOT NULL DEFAULT 'D',
                last_checked_at TEXT,
                next_check_at TEXT,
                next_check_manual INTEGER NOT NULL DEFAULT 0,
                world_lock_decayed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );
            CREATE TABLE IF NOT EXISTS world_tags (
                world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (world_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
                checked_at TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                score INTEGER NOT NULL DEFAULT 0,
                decay_prob INTEGER NOT NULL DEFAULT 0,
                loot_prob INTEGER NOT NULL DEFAULT 0,
                auto_summary TEXT NOT NULL DEFAULT '',
                next_check_at TEXT,
                traits_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_worlds_next_check ON worlds(next_check_at);
            CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_id);
            ",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn upsert_owner(conn: &Connection, name: &str) -> Result<i64, DbError> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(DbError::Custom("Owner name is required".into()));
        }
        conn.execute(
            "INSERT INTO owners (name, created_at) VALUES (?1, ?2)
             ON CONFLICT(name) DO NOTHING",
            params![trimmed, Utc::now().to_rfc3339()],
        )?;
        let id: i64 = conn.query_row(
            "SELECT id FROM owners WHERE name = ?1 COLLATE NOCASE",
            [trimmed],
            |r| r.get(0),
        )?;
        Ok(id)
    }

    fn sync_tags(conn: &Connection, world_id: i64, tags: &[String]) -> Result<(), DbError> {
        conn.execute("DELETE FROM world_tags WHERE world_id = ?1", [world_id])?;
        for raw in tags {
            let tag = raw.trim().trim_start_matches('#').to_lowercase();
            if tag.is_empty() {
                continue;
            }
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [&tag])?;
            let tag_id: i64 = conn.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                [&tag],
                |r| r.get(0),
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO world_tags (world_id, tag_id) VALUES (?1, ?2)",
                params![world_id, tag_id],
            )?;
        }
        Ok(())
    }

    fn row_from_id(conn: &Connection, world_id: i64) -> Result<WorldRow, DbError> {
        let mut stmt = conn.prepare(
            "SELECT w.id, w.name, o.name, w.add_reason, w.is_favorite, w.status, w.primary_lock,
                    w.score, w.decay_prob, w.loot_prob, w.priority_tier, w.last_checked_at,
                    w.next_check_at, w.next_check_manual, w.world_lock_decayed
             FROM worlds w
             JOIN owners o ON o.id = w.owner_id
             WHERE w.id = ?1",
        )?;
        let base = stmt.query_row([world_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
                r.get::<_, i64>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, Option<String>>(11)?,
                r.get::<_, Option<String>>(12)?,
                r.get::<_, i64>(13)?,
                r.get::<_, i64>(14)?,
            ))
        })?;

        let mut tag_stmt = conn.prepare(
            "SELECT t.name FROM tags t
             JOIN world_tags wt ON wt.tag_id = t.id
             WHERE wt.world_id = ?1 ORDER BY t.name",
        )?;
        let tags = tag_stmt
            .query_map([world_id], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        Ok(WorldRow {
            id: base.0,
            name: base.1,
            owner_name: base.2,
            add_reason: base.3,
            is_favorite: base.4 != 0,
            status: base.5,
            primary_lock: base.6,
            score: base.7,
            decay_prob: base.8,
            loot_prob: base.9,
            priority_tier: base.10,
            last_checked_at: base.11,
            next_check_at: base.12,
            next_check_manual: base.13 != 0,
            world_lock_decayed: base.14 != 0,
            tags,
        })
    }

    pub fn list_worlds(&self) -> Result<Vec<WorldRow>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT w.id FROM worlds w ORDER BY
             CASE WHEN w.next_check_at IS NULL THEN 1 ELSE 0 END,
             w.next_check_at ASC,
             w.score DESC",
        )?;
        let ids = stmt
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;
        ids.into_iter()
            .map(|id| Self::row_from_id(&conn, id))
            .collect()
    }

    pub fn list_owner_worlds(&self, owner_name: &str) -> Result<Vec<WorldRow>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT w.id FROM worlds w
             JOIN owners o ON o.id = w.owner_id
             WHERE o.name = ?1 COLLATE NOCASE
             ORDER BY w.name",
        )?;
        let ids = stmt
            .query_map([owner_name], |r| r.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;
        ids.into_iter()
            .map(|id| Self::row_from_id(&conn, id))
            .collect()
    }

    pub fn get_world_detail(&self, world_id: i64) -> Result<WorldDetail, DbError> {
        let conn = self.conn.lock().unwrap();
        let world = Self::row_from_id(&conn, world_id)?;
        let mut stmt = conn.prepare(
            "SELECT id, checked_at, note, score, decay_prob, loot_prob, auto_summary, next_check_at, traits_json
             FROM observations WHERE world_id = ?1 ORDER BY checked_at DESC",
        )?;
        let observations = stmt
            .query_map([world_id], |r| {
                let traits_raw: String = r.get(8)?;
                Ok(ObservationRecord {
                    id: r.get(0)?,
                    checked_at: r.get(1)?,
                    note: r.get(2)?,
                    score: r.get(3)?,
                    decay_prob: r.get(4)?,
                    loot_prob: r.get(5)?,
                    auto_summary: r.get(6)?,
                    next_check_at: r.get(7)?,
                    traits: serde_json::from_str(&traits_raw).unwrap_or(serde_json::json!({})),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(WorldDetail { world, observations })
    }

    pub fn save_world_with_observation(&self, input: ObservationInput) -> Result<WorldDetail, DbError> {
        println!("SAVE START: {}", input.name);
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let owner_id = Self::upsert_owner(&conn, &input.owner_name)?;
        let traits_json = serde_json::to_string(&input.traits)?;
        let wl_decayed = input
            .traits
            .get("worldLockDecayed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let priority = tier_from_score(input.score);
        let world_id = if let Some(id) = input.id {
            conn.execute(
                "UPDATE worlds SET name = ?1, owner_id = ?2, add_reason = ?3, is_favorite = ?4,
                 status = ?5, primary_lock = ?6, score = ?7, decay_prob = ?8, loot_prob = ?9,
                 priority_tier = ?10, last_checked_at = ?11, next_check_at = ?12, next_check_manual = ?13,
                 world_lock_decayed = ?14, updated_at = ?15
                 WHERE id = ?16",
                params![
                    input.name.trim(),
                    owner_id,
                    input.add_reason,
                    input.is_favorite as i64,
                    input.status,
                    input.primary_lock,
                    input.score,
                    input.decay_prob,
                    input.loot_prob,
                    priority,
                    now,
                    input.next_check_at,
                    input.next_check_manual as i64,
                    wl_decayed as i64,
                    now,
                    id
                ],
            )?;
            id
        } else {
            conn.execute(
                "INSERT INTO worlds (name, owner_id, add_reason, is_favorite, status, primary_lock,
                 score, decay_prob, loot_prob, priority_tier, last_checked_at, next_check_at,
                 next_check_manual, world_lock_decayed, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![
                    input.name.trim(),
                    owner_id,
                    input.add_reason,
                    input.is_favorite as i64,
                    input.status,
                    input.primary_lock,
                    input.score,
                    input.decay_prob,
                    input.loot_prob,
                    priority,
                    now,
                    input.next_check_at,
                    input.next_check_manual as i64,
                    wl_decayed as i64,
                    now,
                    now
                ],
            )?;
            conn.last_insert_rowid()
        };

        Self::sync_tags(&conn, world_id, &input.tags)?;

        conn.execute(
            "INSERT INTO observations (world_id, checked_at, note, score, decay_prob, loot_prob,
             auto_summary, next_check_at, traits_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                world_id,
                now,
                input.note,
                input.score,
                input.decay_prob,
                input.loot_prob,
                input.auto_summary,
                input.next_check_at,
                traits_json
            ],
        )?;

        drop(conn);
        self.get_world_detail(world_id)
    }

    pub fn delete_world(&self, world_id: i64) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM worlds WHERE id = ?1", [world_id])?;
        Ok(())
    }

    pub fn get_stats(&self) -> Result<StatsSnapshot, DbError> {
        let conn = self.conn.lock().unwrap();
        let today = Utc::now().format("%Y-%m-%d").to_string();

        let total_worlds: i64 =
            conn.query_row("SELECT COUNT(*) FROM worlds", [], |r| r.get(0))?;
        let checked_today: i64 = conn.query_row(
            "SELECT COUNT(*) FROM worlds WHERE last_checked_at LIKE ?1 || '%'",
            [&today],
            |r| r.get(0),
        )?;
        let average_score: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(score), 0) FROM worlds WHERE status != 'archived'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        let top: Option<(String, i64)> = conn
            .query_row(
                "SELECT name, score FROM worlds ORDER BY score DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let small_lock_decay_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM observations o
             WHERE o.traits_json LIKE '%\"smallLockDecayed\":true%'",
            [],
            |r| r.get(0),
        )?;
        let worlds_with_pets: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT world_id) FROM observations
             WHERE traits_json LIKE '%\"catagotchiHungry\":true%'
                OR traits_json LIKE '%\"dogagotchiHungry\":true%'
                OR traits_json LIKE '%\"catagotchiSick\":true%'
                OR traits_json LIKE '%\"dogagotchiSick\":true%'",
            [],
            |r| r.get(0),
        )?;
        let world_lock_decay_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM worlds WHERE world_lock_decayed = 1", [], |r| {
                r.get(0)
            })?;
        let due_today_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM worlds
             WHERE next_check_at IS NOT NULL AND date(next_check_at) <= date('now')
             AND status NOT IN ('archived', 'decayed') AND world_lock_decayed = 0",
            [],
            |r| r.get(0),
        )?;
        let overdue_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM worlds
             WHERE next_check_at IS NOT NULL AND date(next_check_at) < date('now', '-1 day')
             AND status NOT IN ('archived', 'decayed') AND world_lock_decayed = 0",
            [],
            |r| r.get(0),
        )?;

        Ok(StatsSnapshot {
            total_worlds,
            checked_today,
            average_score,
            top_world_name: top.as_ref().map(|t| t.0.clone()),
            top_world_score: top.map(|t| t.1).unwrap_or(0),
            small_lock_decay_count,
            worlds_with_pets,
            world_lock_decay_count,
            due_today_count,
            overdue_count,
        })
    }

    pub fn export_all(&self) -> Result<ExportBundle, DbError> {
        let worlds = self.list_worlds()?;
        let mut details = Vec::new();
        for w in &worlds {
            details.push(self.get_world_detail(w.id)?);
        }
        Ok(ExportBundle {
            version: 1,
            exported_at: Utc::now().to_rfc3339(),
            data: serde_json::to_value(details)?,
        })
    }

    pub fn import_all(&self, bundle: ExportBundle) -> Result<(), DbError> {
        if bundle.version != 1 {
            return Err(DbError::Custom("Unsupported export version".into()));
        }
        let details: Vec<WorldDetail> = serde_json::from_value(bundle.data)?;
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM observations", [])?;
        conn.execute("DELETE FROM world_tags", [])?;
        conn.execute("DELETE FROM worlds", [])?;
        conn.execute("DELETE FROM tags", [])?;
        conn.execute("DELETE FROM owners", [])?;
        drop(conn);

        for detail in details {
            let latest = detail.observations.first();
            let traits = latest
                .map(|o| o.traits.clone())
                .unwrap_or(serde_json::json!({}));
            let input = ObservationInput {
                id: None,
                name: detail.world.name,
                owner_name: detail.world.owner_name,
                add_reason: detail.world.add_reason,
                is_favorite: detail.world.is_favorite,
                status: detail.world.status,
                primary_lock: detail.world.primary_lock,
                tags: detail.world.tags,
                note: latest.map(|o| o.note.clone()).unwrap_or_default(),
                score: detail.world.score,
                decay_prob: detail.world.decay_prob,
                loot_prob: detail.world.loot_prob,
                auto_summary: latest
                    .map(|o| o.auto_summary.clone())
                    .unwrap_or_default(),
                next_check_at: detail.world.next_check_at,
                next_check_manual: detail.world.next_check_manual,
                traits,
            };
            self.save_world_with_observation(input)?;
        }
        Ok(())
    }
}

fn tier_from_score(score: i64) -> String {
    if score >= 90 {
        "S".into()
    } else if score >= 75 {
        "A".into()
    } else if score >= 60 {
        "B".into()
    } else if score >= 40 {
        "C".into()
    } else {
        "D".into()
    }
}
